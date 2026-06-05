import { chromium, firefox } from 'playwright';
import { logger } from './utils.js';
import { bypassRestrictions } from './protection-bypass.js';
import { getBrowserProfilePath, loadCookiesFromFile } from './cookies.js';

/**
 * Инициализирует и настраивает браузер
 */
export async function initBrowser(options) {
  const isHeaded = !!options.headed;
  const launchOptions = {
    headless: !isHeaded,
    args: [
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--blink-settings=imagesEnabled=true'
    ]
  };

  let browser;
  let context;
  
  // Определяем источник cookies и профиля
  const cookieSource = options.cookies;
  let profilePath = null;
  let browserType = 'chromium'; // По умолчанию

  if (cookieSource === 'chrome' || cookieSource === 'edge' || cookieSource === 'firefox') {
    profilePath = getBrowserProfilePath(cookieSource);
    if (cookieSource === 'firefox') browserType = 'firefox';
    
    if (profilePath) {
      logger.info(`Используем профиль браузера: ${cookieSource} (${profilePath})`);
      logger.warn(`ВНИМАНИЕ: Если ${cookieSource} сейчас запущен, закройте его, иначе Playwright выдаст ошибку блокировки профиля.`);
    } else {
      logger.warn(`Профиль браузера ${cookieSource} не найден. Запускаем чистый сеанс.`);
    }
  }

  // Запуск браузера
  if (profilePath) {
    // Режим Persistent Context (использует реальный профиль с куками и сессиями)
    const driver = browserType === 'chromium' ? chromium : firefox;
    context = await driver.launchPersistentContext(profilePath, {
      ...launchOptions,
      viewport: options.viewport ? parseViewport(options.viewport) : { width: 1920, height: 1080 },
      userAgent: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
  } else {
    // Стандартный чистый режим
    const driver = browserType === 'chromium' ? chromium : firefox;
    browser = await driver.launch(launchOptions);
    context = await browser.newContext({
      viewport: options.viewport ? parseViewport(options.viewport) : { width: 1920, height: 1080 },
      userAgent: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      acceptDownloads: true
    });

    // Загрузка cookies из файла, если указан путь
    if (cookieSource && cookieSource.startsWith('file:')) {
      const filePath = cookieSource.replace('file:', '');
      try {
        const cookies = loadCookiesFromFile(filePath);
        await context.addCookies(cookies);
        logger.info(`Успешно загружено ${cookies.length} cookies из файла.`);
      } catch (err) {
        logger.warn(`Не удалось применить cookies из файла.`);
      }
    }
  }

  // Создаем страницу
  // В persistent context первая вкладка создается автоматически
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  // Добавляем stealth-скрипты
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru', 'en-US', 'en'] });
  });

  return { browser, context, page };
}

/**
 * Загружает URL, прокручивает страницу и обходит защиты
 */
export async function loadPage(page, url, options) {
  logger.info(`Загрузка страницы: ${url}`);
  
  // Устанавливаем таймаут
  const timeout = options.timeout ? parseInt(options.timeout) : 30000;
  page.setDefaultTimeout(timeout);

  // Обход защит до загрузки
  if (options.bypass !== false) {
    await bypassRestrictions(page);
  }

  // Переход на страницу
  await page.goto(url, { waitUntil: 'load', timeout });

  // Ждем стабилизации сети (networkidle) если возможно
  try {
    await page.waitForLoadState('networkidle', { timeout: 5000 });
  } catch (e) {
    logger.debug('Таймаут ожидания networkidle, продолжаем работу.');
  }

  // Скроллинг страницы для ленивой загрузки (lazy load картинок и контента)
  if (options.scroll !== false) {
    logger.info('Прокрутка страницы для загрузки скрытого контента...');
    await autoScroll(page);
  }

  // Пост-загрузочный обход защит
  if (options.bypass !== false) {
    await page.evaluate(() => {
      // Запускаем снятие ограничений повторно
      if (window.bypassPostLoad) window.bypassPostLoad();
    });
  }

  // Дополнительное ожидание, если указано пользователем
  if (options.wait) {
    const waitMs = parseInt(options.wait);
    logger.info(`Ожидание ${waitMs} мс...`);
    await page.waitForTimeout(waitMs);
  }
}

/**
 * Парсит строку вида 1920x1080 в объект viewport
 */
function parseViewport(viewportStr) {
  const parts = viewportStr.split('x');
  if (parts.length === 2) {
    const width = parseInt(parts[0], 10);
    const height = parseInt(parts[1], 10);
    if (!isNaN(width) && !isNaN(height)) {
      return { width, height };
    }
  }
  return { width: 1920, height: 1080 };
}

/**
 * Скроллит страницу вниз порциями для подгрузки динамического контента
 */
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 250;
      const maxScrolls = 200; // Ограничение, чтобы не зависнуть на бесконечной ленте
      let scrolls = 0;
      
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        scrolls++;

        if (totalHeight >= scrollHeight || scrolls >= maxScrolls) {
          clearInterval(timer);
          // Возвращаемся в начало для правильного рендеринга PDF/скриншотов
          window.scrollTo(0, 0);
          setTimeout(resolve, 500); // Небольшая пауза для рендеринга картинок вверху
        }
      }, 70);
    });
  });
}
