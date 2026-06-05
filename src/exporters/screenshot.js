import { logger } from '../utils.js';

/**
 * Экспортирует скриншот текущей страницы (PNG или JPEG)
 * @param {import('playwright').Page} page 
 * @param {string} outputPath 
 * @param {object} options 
 */
export async function exportToScreenshot(page, outputPath, options = {}) {
  const isPng = outputPath.endsWith('.png');
  const type = isPng ? 'png' : 'jpeg';
  logger.info(`Экспорт в скриншот (${type.toUpperCase()}): ${outputPath}`);
  
  try {
    const screenshotOptions = {
      path: outputPath,
      type: type,
      fullPage: options.fullPage !== false // По умолчанию делаем полностраничный скриншот
    };

    // Для JPEG можно задать качество (0-100)
    if (type === 'jpeg') {
      screenshotOptions.quality = options.quality ? parseInt(options.quality) : 85;
    }

    await page.screenshot(screenshotOptions);
    logger.success(`Скриншот сохранен: ${outputPath}`);
  } catch (err) {
    logger.error(`Ошибка при создании скриншота: ${err.message}`, err);
    throw err;
  }
}
