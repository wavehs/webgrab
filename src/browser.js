import { chromium, firefox } from 'playwright';
import { logger } from './utils.js';
import { bypassRestrictions, bypassPostLoad } from './protection-bypass.js';
import { getBrowserProfilePath, loadCookiesFromFile } from './cookies.js';
import { detectPlatform, expandCollapsedContent } from './content-detector.js';
import { applyStealth } from './stealth.js';
import { setupFontInterception } from './font-decoder.js';
import { processCanvasesOCR } from './canvas-extractor.js';
import { getBrowserProfile } from './fingerprint.js';
import { humanizePage } from './behavior.js';

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

  // Поддержка прокси в launchOptions
  if (options.proxy) {
    launchOptions.proxy = { server: options.proxy };
  }

  // Получаем профиль отпечатков
  const profile = getBrowserProfile(options.profile);
  logger.info(`Используем профиль отпечатков: ${profile.name}`);

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

  // Загружаем состояние сессии из файла
  let loadedSession = null;
  if (options.loadSession) {
    const { loadSession } = await import('./session-manager.js');
    loadedSession = loadSession(options.loadSession);
  }

  // Запуск браузера
  if (profilePath) {
    // Режим Persistent Context (использует реальный профиль с куками и сессиями)
    const driver = browserType === 'chromium' ? chromium : firefox;
    context = await driver.launchPersistentContext(profilePath, {
      ...launchOptions,
      viewport: options.viewport ? parseViewport(options.viewport) : profile.viewport,
      userAgent: options.userAgent || profile.userAgent,
      deviceScaleFactor: profile.deviceScaleFactor || 1,
      storageState: loadedSession ? loadedSession.storageState : undefined
    });
  } else {
    // Стандартный чистый режим
    const driver = browserType === 'chromium' ? chromium : firefox;
    browser = await driver.launch(launchOptions);
    context = await browser.newContext({
      viewport: options.viewport ? parseViewport(options.viewport) : profile.viewport,
      userAgent: options.userAgent || profile.userAgent,
      acceptDownloads: true,
      proxy: options.proxy ? { server: options.proxy } : undefined,
      deviceScaleFactor: profile.deviceScaleFactor || 1,
      storageState: loadedSession ? loadedSession.storageState : undefined
    });

    // Загрузка cookies из файла или массива
    if (cookieSource && cookieSource.startsWith && cookieSource.startsWith('file:')) {
      const filePath = cookieSource.replace('file:', '');
      try {
        const cookies = loadCookiesFromFile(filePath);
        await context.addCookies(cookies);
        logger.info(`Успешно загружено ${cookies.length} cookies из файла.`);
      } catch (err) {
        logger.warn(`Не удалось применить cookies из файла.`);
      }
    } else if (Array.isArray(cookieSource)) {
      try {
        await context.addCookies(cookieSource);
        logger.info(`Успешно загружено ${cookieSource.length} cookies.`);
      } catch (err) {
        logger.warn(`Не удалось применить cookies из массива.`);
      }
    }
  }

  // Создаем страницу
  // В persistent context первая вкладка создается автоматически
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  // Настраиваем перехват шрифтов
  setupFontInterception(page);

  // Восстанавливаем sessionStorage
  if (loadedSession && loadedSession.sessionStorage) {
    const { injectSessionStorage } = await import('./session-manager.js');
    await injectSessionStorage(page, loadedSession.sessionStorage);
  }

  // Добавляем stealth-скрипты
  if (options.stealth) {
    logger.info('Применяем расширенный Stealth-режим...');
    await applyStealth(page, profile);
  } else {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
      Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru', 'en-US', 'en'] });
    });
  }

  // Применяем extra-headers
  if (options.extraHeaders) {
    try {
      let headers = options.extraHeaders;
      if (typeof headers === 'string') {
        headers = JSON.parse(headers);
      }
      await context.setExtraHTTPHeaders(headers);
      logger.info('Применены дополнительные HTTP заголовки.');
    } catch (err) {
      logger.error('Ошибка при разборе --extra-headers:', err);
    }
  }

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

  // Определяем платформу
  const platform = detectPlatform(url);

  // Обход защит до загрузки
  if (options.bypass !== false) {
    await bypassRestrictions(page);
  }

  // Переход на страницу
  await page.goto(url, { waitUntil: 'load', timeout });

  // Ждем стабилизации сети (networkidle) если возможно
  try {
    await page.waitForLoadState('networkidle', { timeout: 8000 });
  } catch (e) {
    logger.debug('Таймаут ожидания networkidle, продолжаем работу.');
  }

  // Для SPA-платформ — ждём появления контейнера контента
  if (platform && platform.waitSelector) {
    try {
      logger.info(`Ожидание контента платформы ${platform.name}...`);
      await page.waitForSelector(platform.waitSelector, { timeout: 15000 });
      // Дополнительная пауза для рендеринга
      await page.waitForTimeout(2000);
    } catch (e) {
      logger.debug(`Контейнер контента платформы не появился (${platform.waitSelector}), продолжаем.`);
    }
  }

  // Раскрытие свёрнутых блоков (до скроллинга, чтобы увидеть полный скролл)
  if (options.expand !== false) {
    logger.info('Раскрытие свёрнутых блоков...');
    await expandCollapsedContent(page, platform);
  }

  // Скроллинг страницы для ленивой загрузки (lazy load картинок и контента)
  if (options.scroll !== false && !options.humanize) {
    const useDeepScroll = options.deepScroll || (platform && platform.needsDeepScroll);
    
    if (useDeepScroll) {
      logger.info('Глубокий скроллинг для загрузки динамического контента...');
      await deepScroll(page);
    } else {
      logger.info('Прокрутка страницы для загрузки скрытого контента...');
      await autoScroll(page);
    }
  }

  // Симуляция человеческого поведения
  if (options.humanize) {
    await humanizePage(page, options);
  }

  // Повторное раскрытие блоков после скроллинга (могли появиться новые)
  if (options.expand !== false) {
    await expandCollapsedContent(page, platform);
  }

  // Пост-загрузочный обход защит
  if (options.bypass !== false) {
    await bypassPostLoad(page);
  }

  // Распознавание canvas текста (OCR)
  if (options.ocr) {
    await processCanvasesOCR(page, options);
  }

  // Автоматическое решение капчи
  if (options.captchaService && options.captchaKey) {
    const { trySolveCaptchaPage } = await import('./captcha-solver.js');
    await trySolveCaptchaPage(page, options);
  }

  // Ожидание загрузки изображений
  await waitForImages(page);

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
 * Базовый скроллинг: крутит вниз порциями (для обычных сайтов)
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

/**
 * Глубокий скроллинг: скроллит порциями и ждёт подгрузки нового контента через MutationObserver.
 * Для SPA-сайтов, где контент рендерится лениво при скролле.
 */
async function deepScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const distance = 400;
      const maxScrolls = 500;
      const scrollPause = 300;        // Пауза между скроллами (мс)
      const mutationWait = 1500;      // Время ожидания мутаций после скролла
      let scrolls = 0;
      let lastScrollHeight = 0;
      let stableCount = 0; // Счётчик отсутствия новых мутаций
      const MAX_STABLE = 3; // Завершаем после N скроллов без новых данных

      async function scrollStep() {
        if (scrolls >= maxScrolls || stableCount >= MAX_STABLE) {
          // Возвращаемся в начало
          window.scrollTo(0, 0);
          setTimeout(resolve, 500);
          return;
        }

        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        scrolls++;

        // Ждём потенциальной подгрузки
        await new Promise(r => setTimeout(r, scrollPause));

        // Проверяем: появился ли новый контент?
        const newScrollHeight = document.body.scrollHeight;
        const currentScroll = window.scrollY + window.innerHeight;

        if (newScrollHeight > lastScrollHeight) {
          // Контент появился — сбрасываем счётчик стабильности
          stableCount = 0;
          lastScrollHeight = newScrollHeight;
          
          // Ждём дополнительно для подгрузки lazy-контента
          await new Promise(r => setTimeout(r, mutationWait));
        } else if (currentScroll >= newScrollHeight - 10) {
          // Дошли до конца и новый контент не появляется
          stableCount++;
          // Ждём побольше — может быть задержка
          await new Promise(r => setTimeout(r, mutationWait));
        }

        // Следующий шаг
        await scrollStep();
      }

      scrollStep();
    });
  });

  // После основного скролла — медленно скроллим обратно вверх
  // (некоторые SPA подгружают контент при обратном скролле)
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const distance = 800;
      const timer = setInterval(() => {
        window.scrollBy(0, -distance);
        if (window.scrollY <= 0) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          setTimeout(resolve, 500);
        }
      }, 100);
    });
  });
}

/**
 * Ожидает загрузки видимых изображений на странице
 */
async function waitForImages(page) {
  try {
    await page.evaluate(async () => {
      const images = Array.from(document.querySelectorAll('img'));
      const visibleImages = images.filter(img => {
        const rect = img.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

      await Promise.allSettled(
        visibleImages.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
            // Таймаут на случай зависания
            setTimeout(resolve, 5000);
          });
        })
      );
    });
  } catch (e) {
    // Не критично — просто логируем
    logger.debug('Таймаут ожидания загрузки изображений.');
  }
}
