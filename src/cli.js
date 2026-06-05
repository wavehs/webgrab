import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { logger, sanitizeFilename } from './utils.js';
import { initBrowser, loadPage } from './browser.js';

// Импорт экспортеров
import { exportToPdf } from './exporters/pdf.js';
import { exportToHtml } from './exporters/html.js';
import { exportToMhtml } from './exporters/mhtml.js';
import { exportToScreenshot } from './exporters/screenshot.js';
import { exportToMarkdown } from './exporters/markdown.js';
import { exportToText } from './exporters/text.js';

const EXPORTERS = {
  pdf: { ext: '.pdf', fn: exportToPdf },
  html: { ext: '.html', fn: exportToHtml },
  mhtml: { ext: '.mhtml', fn: exportToMhtml },
  png: { ext: '.png', fn: exportToScreenshot },
  jpg: { ext: '.jpg', fn: exportToScreenshot },
  jpeg: { ext: '.jpg', fn: exportToScreenshot },
  md: { ext: '.md', fn: exportToMarkdown },
  txt: { ext: '.txt', fn: exportToText }
};

export async function run() {
  const program = new Command();
  
  program
    .name('webgrab')
    .description('Консольная утилита для сохранения веб-страниц в любые форматы в обход защит')
    .version('1.0.0')
    .argument('[url]', 'URL страницы для скачивания')
    .option('-f, --format <format>', 'Формат сохранения (pdf, html, mhtml, png, jpg, md, txt, all)', 'pdf')
    .option('-o, --output <filename>', 'Имя выходного файла (без расширения, по умолчанию берется заголовок страницы)')
    .option('-d, --dir <directory>', 'Директория для сохранения', '.')
    .option('-c, --cookies <source>', 'Источник cookies: chrome, edge, firefox, или file:путь_к_файлу')
    .option('-w, --wait <ms>', 'Дополнительное ожидание после загрузки страницы (мс)')
    .option('--headed', 'Запустить браузер в видимом режиме')
    .option('--no-bypass', 'Не отключать клиентские защиты от копирования')
    .option('--no-scroll', 'Не прокручивать страницу для ленивой загрузки')
    .option('--no-expand', 'Не раскрывать свёрнутые блоки (аккордеоны, details/summary)')
    .option('--deep-scroll', 'Глубокий скроллинг с ожиданием подгрузки контента (для SPA)')
    .option('--selector <css>', 'CSS-селектор основного контента (вместо автоопределения)')
    .option('--list <file>', 'Текстовый файл со списком URL (по одному на строку)')
    .option('--timeout <ms>', 'Таймаут загрузки страницы (мс)', '30000')
    .option('--viewport <size>', 'Размер окна (например, 1920x1080)', '1920x1080')
    .option('--verbose', 'Подробный вывод логирования')
    .option('--gui', 'Запустить графический интерфейс (GUI) в браузере')
    
    // Новые опции
    .option('--stealth', 'Включить stealth-режим (webdriver patching, fingerprint spoofing)')
    .option('--profile <name>', 'Профиль браузера (chrome-win, chrome-mac, firefox-win, safari-mac)', 'chrome-win')
    .option('--humanize', 'Симуляция человеческого поведения (движение мыши, скролл, задержки)')
    .option('--ocr', 'Включить OCR для canvas-элементов (требует tesseract.js)')
    .option('--decode-fonts', 'Включить деобфускацию шрифтов (требует opentype.js)')
    .option('--browser-cookies <browser>', 'Извлечь cookies из браузера: chrome, firefox, edge')
    .option('--save-session <path>', 'Сохранить сессию после загрузки')
    .option('--load-session <path>', 'Загрузить сохранённую сессию')
    .option('--extra-headers <json>', 'Дополнительные HTTP заголовки (JSON строка)')
    .option('--proxy <url>', 'Использовать прокси (http://user:pass@host:port)')
    .option('--proxy-list <path>', 'Файл со списком прокси для ротации')
    .option('--captcha-service <name>', 'Сервис CAPTCHA: 2captcha, capsolver, anticaptcha')
    .option('--captcha-key <key>', 'API-ключ CAPTCHA сервиса')
    .option('--retries <n>', 'Количество повторных попыток при ошибках', '3')
    .option('--no-render', 'Использовать легковесный HTTP-клиент вместо Playwright (недоступно для pdf/png/jpg/mhtml)');

  program.parse(process.argv);

  const options = program.opts();
  const urlArg = program.args[0];

  if (options.verbose) {
    process.env.VERBOSE = 'true';
  }

  // Проверка аргументов и запуск GUI при необходимости
  if (options.gui || (!urlArg && !options.list)) {
    const { startGui } = await import('./gui.js');
    await startGui();
    return;
  }

  let urls = [];
  if (urlArg) {
    urls.push(urlArg);
  }

  if (options.list) {
    try {
      if (!fs.existsSync(options.list)) {
        logger.error(`Файл со списком URL не найден: ${options.list}`);
        process.exit(1);
      }
      const fileContent = fs.readFileSync(options.list, 'utf-8');
      const parsedUrls = fileContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#')); // Пропускаем комментарии и пустые строки
      urls = urls.concat(parsedUrls);
      logger.info(`Загружено ${parsedUrls.length} URL из файла: ${options.list}`);
    } catch (err) {
      logger.error(`Ошибка при чтении файла со списком URL: ${err.message}`, err);
      process.exit(1);
    }
  }

  await executeGrab(urls, options);
}

export async function executeGrab(urls, options) {
  if (options.verbose) {
    process.env.VERBOSE = 'true';
  }

  // Создаем директорию назначения, если она не существует
  const targetDir = path.resolve(options.dir || '.');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    logger.info(`Создана папка для сохранения: ${targetDir}`);
  }

  // Если указано --browser-cookies, извлекаем их перед началом
  if (options.browserCookies) {
    try {
      const { extractBrowserCookies } = await import('./cookies.js');
      const browserCookies = await extractBrowserCookies(options.browserCookies);
      // Заменяем источник cookies на массив извлеченных кук
      options.cookies = browserCookies;
    } catch (err) {
      logger.error(`Ошибка извлечения кук из браузера ${options.browserCookies}: ${err.message}`);
    }
  }

  const { executeWithRetry } = await import('./retry.js');

  // Обрабатываем каждый URL по очереди
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    logger.info(`=== Обработка URL [${i + 1}/${urls.length}]: ${url} ===`);
    
    try {
      // Запускаем через модуль ретраев и ротации
      await executeWithRetry(url, options, async (targetUrl, currentOptions) => {
        const formatsToExport = getFormatsToExport(currentOptions.format, currentOptions.cookies);

        if (currentOptions.render === false || currentOptions.noRender) {
          // ----------------------------------------
          // Режим БЕЗ рендеринга (http-client)
          // ----------------------------------------
          const { fetchPage } = await import('./http-client.js');
          const html = await fetchPage(targetUrl, currentOptions);

          const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
          const title = titleMatch ? titleMatch[1].trim() : `page_${Date.now()}`;
          const baseName = currentOptions.output && urls.length === 1 
            ? sanitizeFilename(currentOptions.output) 
            : sanitizeFilename(title || `page_${Date.now()}`);

          for (const format of formatsToExport) {
            const fileName = `${baseName}.${format}`;
            const outputPath = path.join(targetDir, fileName);

            if (format === 'html') {
              fs.writeFileSync(outputPath, html, 'utf-8');
              logger.success(`Файл HTML сохранен (no-render): ${outputPath}`);
            } else if (format === 'md') {
              const TurndownService = (await import('turndown')).default;
              const { gfm } = await import('turndown-plugin-gfm');
              const turndownService = new TurndownService({
                headingStyle: 'atx',
                codeBlockStyle: 'fenced'
              });
              turndownService.use(gfm);
              
              let md = turndownService.turndown(html);
              if (currentOptions.decodeFonts) {
                const { getDecodedFontMap, deobfuscateText } = await import('./font-decoder.js');
                // В легковесном режиме перехват шрифтов недоступен, но маппинг может быть переиспользован
                // или передан напрямую. Мы просто вызываем декодер на случай если маппинг сохранен.
              }
              fs.writeFileSync(outputPath, md, 'utf-8');
              logger.success(`Файл Markdown сохранен (no-render): ${outputPath}`);
            } else if (format === 'txt') {
              const { convert } = await import('html-to-text');
              const txt = convert(html, { wordwrap: 120 });
              fs.writeFileSync(outputPath, txt, 'utf-8');
              logger.success(`Файл Текст сохранен (no-render): ${outputPath}`);
            } else {
              logger.warn(`Формат "${format}" не поддерживается в режиме без рендеринга (--no-render). Пропуск.`);
            }
          }
        } else {
          // ----------------------------------------
          // Стандартный режим рендеринга (Playwright)
          // ----------------------------------------
          const browserInstance = await initBrowser(currentOptions);
          const { page, browser, context } = browserInstance;

          try {
            await loadPage(page, targetUrl, currentOptions);

            const title = await page.title();
            const baseName = currentOptions.output && urls.length === 1 
              ? sanitizeFilename(currentOptions.output) 
              : sanitizeFilename(title || `page_${Date.now()}`);

            for (const format of formatsToExport) {
              const exporter = EXPORTERS[format];
              if (!exporter) continue;

              const fileName = `${baseName}${exporter.ext}`;
              const outputPath = path.join(targetDir, fileName);

              await exporter.fn(page, outputPath, currentOptions);
            }

            // Сохранение сессии
            if (currentOptions.saveSession) {
              const { saveSession } = await import('./session-manager.js');
              await saveSession(context, page, currentOptions.saveSession);
            }
          } finally {
            if (browser) {
              await browser.close();
            } else if (context) {
              await context.close();
            }
          }
        }
      });
    } catch (err) {
      logger.error(`Не удалось обработать URL: ${url} после всех попыток. Ошибка: ${err.message}`);
    }
  }
  
  logger.success('Работа завершена.');
}

/**
 * Определяет список форматов для экспорта
 */
function getFormatsToExport(formatOption, cookieSource) {
  const format = formatOption.toLowerCase();
  
  if (format === 'all') {
    const list = ['pdf', 'html', 'png', 'md', 'txt'];
    // MHTML доступен только для Chromium (когда нет Firefox)
    if (cookieSource !== 'firefox') {
      list.push('mhtml');
    }
    return list;
  }

  if (EXPORTERS[format]) {
    return [format];
  }

  logger.warn(`Неизвестный формат "${formatOption}", используем по умолчанию PDF.`);
  return ['pdf'];
}
