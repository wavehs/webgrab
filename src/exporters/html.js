import fs from 'fs';
import { logger } from '../utils.js';
import { getDecodedFontMap, deobfuscateText } from '../font-decoder.js';

/**
 * Экспортирует текущее состояние HTML страницы
 * @param {import('playwright').Page} page 
 * @param {string} outputPath 
 * @param {object} options 
 */
export async function exportToHtml(page, outputPath, options = {}) {
  logger.info(`Экспорт в HTML: ${outputPath}`);
  
  try {
    let htmlContent = await page.content();
    if (options.decodeFonts) {
      const fontMap = await getDecodedFontMap(page);
      htmlContent = deobfuscateText(htmlContent, fontMap);
    }
    fs.writeFileSync(outputPath, htmlContent, 'utf-8');
    logger.success(`Файл HTML сохранен: ${outputPath}`);
  } catch (err) {
    logger.error(`Ошибка при экспорте в HTML: ${err.message}`, err);
    throw err;
  }
}
