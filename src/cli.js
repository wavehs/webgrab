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
    .option('--verbose', 'Подробный вывод логирования');

  program.parse(process.argv);

  const options = program.opts();
  const urlArg = program.args[0];

  if (options.verbose) {
    process.env.VERBOSE = 'true';
  }

  // Проверка аргументов
  if (!urlArg && !options.list) {
    logger.error('Ошибка: Необходимо указать URL страницы или путь к файлу со списком URL через --list.');
    program.help();
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

  // Создаем директорию назначения, если она не существует
  const targetDir = path.resolve(options.dir);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    logger.info(`Создана папка для сохранения: ${targetDir}`);
  }

  let browserInstance = null;

  try {
    // Инициализация браузера
    logger.info('Инициализация браузера...');
    browserInstance = await initBrowser(options);
    const { page, browser } = browserInstance;

    // Обрабатываем каждый URL по очереди
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      logger.info(`=== Обработка URL [${i + 1}/${urls.length}]: ${url} ===`);
      
      try {
        await loadPage(page, url, options);

        // Получаем заголовок страницы для имени файла
        const title = await page.title();
        const baseName = options.output && urls.length === 1 
          ? sanitizeFilename(options.output) 
          : sanitizeFilename(title || `page_${Date.now()}`);

        const formatsToExport = getFormatsToExport(options.format, options.cookies);

        for (const format of formatsToExport) {
          const exporter = EXPORTERS[format];
          if (!exporter) continue;

          const fileName = `${baseName}${exporter.ext}`;
          const outputPath = path.join(targetDir, fileName);

          await exporter.fn(page, outputPath, options);
        }
      } catch (err) {
        logger.error(`Не удалось обработать URL: ${url}`, err);
      }
    }
  } catch (err) {
    logger.error('Глобальная ошибка выполнения:', err);
  } finally {
    if (browserInstance) {
      logger.info('Закрытие сессии браузера...');
      if (browserInstance.browser) {
        // Обычный браузер
        await browserInstance.browser.close();
      } else if (browserInstance.context) {
        // Persistent context
        await browserInstance.context.close();
      }
      logger.success('Работа завершена.');
    }
  }
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
