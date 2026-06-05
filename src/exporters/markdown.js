import fs from 'fs';
import TurndownService from 'turndown';
import { logger } from '../utils.js';

/**
 * Экспортирует контент страницы в Markdown
 * @param {import('playwright').Page} page 
 * @param {string} outputPath 
 * @param {object} options 
 */
export async function exportToMarkdown(page, outputPath, options = {}) {
  logger.info(`Экспорт в Markdown: ${outputPath}`);
  
  try {
    // Получаем очищенный HTML основного содержимого
    const cleanedHtml = await page.evaluate(() => {
      const selectors = ['article', 'main', '[role="main"]', '#content', '.content', '.post', 'body'];
      
      let mainElement = null;
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el && el.innerText.trim().length > 100) { // Элемент должен быть содержательным
          mainElement = el;
          break;
        }
      }

      if (!mainElement) {
        mainElement = document.body;
      }

      // Создаем копию элемента, чтобы не изменять страницу в браузере
      const clone = mainElement.cloneNode(true);
      
      // Список элементов для удаления (не несущих полезной текстовой нагрузки)
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

    // Настраиваем Turndown
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
      bulletListMarker: '-'
    });

    // Добавляем правила обработки таблиц (по умолчанию turndown может их игнорировать)
    turndownService.addRule('tables', {
      filter: ['table'],
      replacement: function (content, node) {
        // Простая конвертация таблиц в текстовый вид
        return '\n\n' + content + '\n\n';
      }
    });

    const markdown = turndownService.turndown(cleanedHtml);
    
    // Форматируем и сохраняем
    fs.writeFileSync(outputPath, markdown, 'utf-8');
    logger.success(`Файл Markdown сохранен: ${outputPath}`);
  } catch (err) {
    logger.error(`Ошибка при экспорте в Markdown: ${err.message}`, err);
    throw err;
  }
}
