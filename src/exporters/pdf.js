import { logger } from '../utils.js';

/**
 * Экспортирует текущую страницу в PDF файл
 * @param {import('playwright').Page} page 
 * @param {string} outputPath 
 * @param {object} options 
 */
export async function exportToPdf(page, outputPath, options = {}) {
  logger.info(`Экспорт в PDF: ${outputPath}`);
  
  try {
    // Применяем CSS-стили для эмуляции медиа-типа print или screen.
    // Некоторые сайты скрывают контент в режиме печати (print CSS).
    // По умолчанию эмулируем 'screen', чтобы PDF выглядел точно так же, как на экране.
    await page.emulateMedia({ media: options.media || 'screen' });

    await page.pdf({
      path: outputPath,
      format: options.pdfFormat || 'A4',
      printBackground: true, // Всегда печатаем цвета и картинки заднего плана
      preferCSSPageSize: true, // Использовать размеры страниц, заданные в CSS сайта
      margin: {
        top: '0.8cm',
        bottom: '0.8cm',
        left: '0.8cm',
        right: '0.8cm'
      }
    });
    
    logger.success(`Файл PDF сохранен: ${outputPath}`);
  } catch (err) {
    logger.error(`Ошибка при экспорте в PDF: ${err.message}`, err);
    throw err;
  }
}
