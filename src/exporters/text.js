import fs from 'fs';
import { convert } from 'html-to-text';
import { logger } from '../utils.js';
import { extractContent } from '../content-detector.js';

/**
 * Экспортирует контент страницы в Plain Text (.txt)
 * @param {import('playwright').Page} page 
 * @param {string} outputPath 
 * @param {object} options 
 */
export async function exportToText(page, outputPath, options = {}) {
  logger.info(`Экспорт в Текст: ${outputPath}`);
  
  try {
    // Получаем очищенный HTML через умный детектор контента
    const cleanedHtml = await extractContent(page, {
      selector: options.selector,
      url: page.url(),
    });

    // Конвертируем HTML в форматированный Plain Text
    const text = convert(cleanedHtml, {
      wordwrap: 120,
      preserveNewlines: true,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },      // Игнорируем URL ссылок для чистоты текста
        { selector: 'img', format: 'skip' },                   // Пропускаем изображения
        { selector: 'table', format: 'dataTable' },            // Форматируем таблицы как данные
        { selector: 'h1', options: { uppercase: false } },      // Заголовки без капса
        { selector: 'h2', options: { uppercase: false } },
        { selector: 'h3', options: { uppercase: false } },
        { selector: 'h4', options: { uppercase: false } },
      ]
    });

    // Постобработка: убираем лишние пустые строки
    const cleanText = text
      .replace(/\n{4,}/g, '\n\n\n')
      .replace(/^\s+/, '')
      .trim();

    fs.writeFileSync(outputPath, cleanText, 'utf-8');
    logger.success(`Текстовый файл сохранен: ${outputPath}`);
  } catch (err) {
    logger.error(`Ошибка при экспорте в текст: ${err.message}`, err);
    throw err;
  }
}
