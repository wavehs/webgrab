import fs from 'fs';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { logger } from '../utils.js';
import { extractContent } from '../content-detector.js';

/**
 * Экспортирует контент страницы в Markdown
 * @param {import('playwright').Page} page 
 * @param {string} outputPath 
 * @param {object} options 
 */
export async function exportToMarkdown(page, outputPath, options = {}) {
  logger.info(`Экспорт в Markdown: ${outputPath}`);
  
  try {
    // Получаем очищенный HTML через умный детектор контента
    const cleanedHtml = await extractContent(page, {
      selector: options.selector,
      url: page.url(),
    });

    // Настраиваем Turndown
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
      bulletListMarker: '-',
      strongDelimiter: '**',
    });

    // Подключаем GFM плагин (таблицы, strikethrough, task lists)
    turndownService.use(gfm);

    // Правило: блоки кода с подсветкой языка
    turndownService.addRule('fencedCodeBlock', {
      filter: (node) => {
        return node.nodeName === 'PRE' && node.querySelector('code');
      },
      replacement: (content, node) => {
        const codeElement = node.querySelector('code');
        const className = codeElement.getAttribute('class') || '';
        const langMatch = className.match(/language-(\w+)/);
        const lang = langMatch ? langMatch[1] : '';
        const code = codeElement.textContent || '';
        return `\n\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n\n`;
      }
    });

    // Правило: изображения с alt текстом
    turndownService.addRule('images', {
      filter: 'img',
      replacement: (content, node) => {
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || node.getAttribute('data-src') || '';
        if (!src) return '';
        return `![${alt}](${src})`;
      }
    });

    // Правило: удаление пустых ссылок и технических элементов
    turndownService.addRule('removeEmpty', {
      filter: (node) => {
        // Удаляем пустые span/div/a без содержимого
        if (['SPAN', 'DIV', 'A'].includes(node.nodeName)) {
          const text = (node.textContent || '').trim();
          if (!text && !node.querySelector('img')) return true;
        }
        return false;
      },
      replacement: () => ''
    });

    const markdown = turndownService.turndown(cleanedHtml);
    
    // Постобработка: убираем лишние пустые строки (более 2 подряд)
    const cleanMarkdown = markdown
      .replace(/\n{4,}/g, '\n\n\n')
      .replace(/^\s+/, '')
      .trim();

    // Сохраняем
    fs.writeFileSync(outputPath, cleanMarkdown, 'utf-8');
    logger.success(`Файл Markdown сохранен: ${outputPath}`);
  } catch (err) {
    logger.error(`Ошибка при экспорте в Markdown: ${err.message}`, err);
    throw err;
  }
}
