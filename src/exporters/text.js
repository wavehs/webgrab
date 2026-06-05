import fs from 'fs';
import { convert } from 'html-to-text';
import { logger } from '../utils.js';

/**
 * Экспортирует контент страницы в Plain Text (.txt)
 * @param {import('playwright').Page} page 
 * @param {string} outputPath 
 * @param {object} options 
 */
export async function exportToText(page, outputPath, options = {}) {
  logger.info(`Экспорт в Текст: ${outputPath}`);
  
  try {
    // Получаем очищенный HTML основного содержимого (аналогично Markdown)
    const cleanedHtml = await page.evaluate(() => {
      const selectors = ['article', 'main', '[role="main"]', '#content', '.content', '.post', 'body'];
      
      let mainElement = null;
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el && el.innerText.trim().length > 100) {
          mainElement = el;
          break;
        }
      }

      if (!mainElement) {
        mainElement = document.body;
      }

      const clone = mainElement.cloneNode(true);
      
      // Удаляем интерактивные и служебные элементы
      const selectorsToRemove = [
        'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
        'nav', 'header', 'footer', '.sidebar', '#sidebar', '.ads',
        '.menu', '.cookie-consent', '.social-share', '.comments'
      ];
      
      selectorsToRemove.forEach(sel => {
        clone.querySelectorAll(sel).forEach(el => el.remove());
      });

      return clone.innerHTML;
    });

    // Конвертируем HTML в форматированный Plain Text
    const text = convert(cleanedHtml, {
      wordwrap: 120,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } }, // Игнорируем URL ссылок для чистоты текста
        { selector: 'img', format: 'skip' }              // Пропускаем изображения
      ]
    });

    fs.writeFileSync(outputPath, text, 'utf-8');
    logger.success(`Текстовый файл сохранен: ${outputPath}`);
  } catch (err) {
    logger.error(`Ошибка при экспорте в текст: ${err.message}`, err);
    throw err;
  }
}
