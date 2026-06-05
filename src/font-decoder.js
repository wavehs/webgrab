import opentype from 'opentype.js';
import { logger } from './utils.js';

// Хранилище перехваченных шрифтов для каждого инстанса страницы
const pageFonts = new Map();

/**
 * Настраивает перехват шрифтов на странице.
 * 
 * @param {import('playwright').Page} page
 */
export function setupFontInterception(page) {
  const fonts = [];
  pageFonts.set(page, fonts);

  page.on('response', async (response) => {
    const url = response.url();
    const isFont = url.endsWith('.woff') || url.endsWith('.ttf') || url.endsWith('.otf') || response.request().resourceType() === 'font';
    
    if (isFont) {
      try {
        const buffer = await response.body();
        fonts.push({
          url,
          buffer
        });
      } catch (err) {
        // Пропускаем, если тело недоступно (например, кеш)
      }
    }
  });
}

/**
 * Парсит перехваченные шрифты и строит маппинг символов для деобфускации.
 * 
 * @param {import('playwright').Page} page
 * @returns {Promise<object>} Маппинг { scrambled_char: original_char }
 */
export async function getDecodedFontMap(page) {
  const fonts = pageFonts.get(page) || [];
  const translationMap = {};

  if (fonts.length === 0) {
    return translationMap;
  }

  logger.info(`Парсинг ${fonts.length} перехваченных шрифтов для деобфускации...`);

  for (const fontData of fonts) {
    try {
      const buffer = fontData.buffer;
      // Преобразуем Node.js Buffer в ArrayBuffer для opentype.js
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      
      const font = opentype.parse(arrayBuffer);
      const glyphs = font.glyphs;

      let mappedCount = 0;
      for (let i = 0; i < glyphs.length; i++) {
        const glyph = glyphs.get(i);
        
        if (glyph.name && glyph.unicodes && glyph.unicodes.length > 0) {
          let originalChar = '';
          
          // Эвристика определения оригинального символа по имени глифа:
          // 1. Имя вида uni0041 -> символ 'A' (unicode 0x0041)
          // 2. Односимвольное имя, например 'A'
          if (glyph.name.startsWith('uni') && glyph.name.length === 7) {
            const hexVal = glyph.name.substring(3);
            const codeVal = parseInt(hexVal, 16);
            if (!isNaN(codeVal)) {
              originalChar = String.fromCharCode(codeVal);
            }
          } else if (glyph.name.length === 1) {
            originalChar = glyph.name;
          }

          if (originalChar) {
            for (const unicode of glyph.unicodes) {
              const scrambledChar = String.fromCharCode(unicode);
              if (scrambledChar !== originalChar) {
                translationMap[scrambledChar] = originalChar;
                mappedCount++;
              }
            }
          }
        }
      }
      
      if (mappedCount > 0) {
        logger.success(`Успешно декодирован шрифт ${fontData.url.split('/').pop()}. Найдено ${mappedCount} замен.`);
      }
    } catch (err) {
      // Игнорируем ошибки (например, неподдерживаемый WOFF2)
      logger.debug(`Не удалось распарсить шрифт ${fontData.url}: ${err.message}`);
    }
  }

  return translationMap;
}

/**
 * Применяет маппинг деобфускации к строке текста или HTML.
 * 
 * @param {string} text - Оригинальный текст с обфусцированными символами
 * @param {object} map - Маппинг замен { scrambled_char: original_char }
 * @returns {string} Деобфусцированный текст
 */
export function deobfuscateText(text, map) {
  if (!map || Object.keys(map).length === 0 || !text) {
    return text;
  }

  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    result += map[char] || char;
  }
  return result;
}

/**
 * Очищает хранилище шрифтов для страницы.
 * 
 * @param {import('playwright').Page} page
 */
export function clearPageFonts(page) {
  pageFonts.delete(page);
}
