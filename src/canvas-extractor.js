import { createWorker } from 'tesseract.js';
import { logger } from './utils.js';

/**
 * Выполняет OCR распознавание текста на всех `<canvas>` элементах страницы
 * и заменяет их на текстовые блоки.
 * 
 * @param {import('playwright').Page} page - Страница Playwright
 * @param {object} options - Опции CLI
 */
export async function processCanvasesOCR(page, options = {}) {
  if (!options.ocr) return;

  logger.info('Поиск canvas-элементов для распознавания текста (OCR)...');

  // Получаем список canvas элементов и их base64 данные с предобработкой
  const canvasesData = await page.evaluate(() => {
    // Вспомогательная функция для рекурсивного поиска всех canvas, включая Shadow DOM
    function findCanvases(root = document, results = []) {
      const canvases = root.querySelectorAll('canvas');
      for (const canvas of canvases) {
        // Эвристика: пропускаем трекеры и слишком мелкие элементы
        if (canvas.width > 30 && canvas.height > 30) {
          // Присваиваем уникальный ID для последующего сопоставления
          const id = 'webgrab-canvas-' + Math.random().toString(36).substr(2, 9);
          canvas.setAttribute('data-webgrab-ocr-id', id);
          results.push({
            id,
            width: canvas.width,
            height: canvas.height
          });
        }
      }
      
      const allElements = root.querySelectorAll('*');
      for (const el of allElements) {
        if (el.shadowRoot) {
          findCanvases(el.shadowRoot, results);
        }
      }
      return results;
    }

    const found = findCanvases(document);
    if (found.length === 0) return [];

    // Предобработка canvas (конвертация в grayscale, 2x масштабирование и резкость)
    return found.map(c => {
      // Ищем элемент по ID
      const canvasEl = document.querySelector(`[data-webgrab-ocr-id="${c.id}"]`) || 
                       (() => {
                         // Поиск в Shadow DOM
                         let foundEl = null;
                         const traverse = (root) => {
                           const el = root.querySelector(`[data-webgrab-ocr-id="${c.id}"]`);
                           if (el) { foundEl = el; return; }
                           const all = root.querySelectorAll('*');
                           for (const child of all) {
                             if (child.shadowRoot) traverse(child.shadowRoot);
                           }
                         };
                         traverse(document);
                         return foundEl;
                       })();

      if (!canvasEl) return null;

      try {
        // Создаем временный canvas для предобработки (увеличенный в 2 раза)
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasEl.width * 2;
        tempCanvas.height = canvasEl.height * 2;
        const ctx = tempCanvas.getContext('2d');

        // Отключаем сглаживание для повышения четкости текста при увеличении
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(canvasEl, 0, 0, canvasEl.width, canvasEl.height, 0, 0, tempCanvas.width, tempCanvas.height);

        // Grayscale фильтр
        const imgData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const brightness = 0.34 * data[i] + 0.5 * data[i + 1] + 0.16 * data[i + 2];
          data[i] = brightness;
          data[i + 1] = brightness;
          data[i + 2] = brightness;
        }
        ctx.putImageData(imgData, 0, 0);

        // Sharpen фильтр (матрица свертки)
        const sharpen = (context, w, h) => {
          const weights = [
             0, -1,  0,
            -1,  5, -1,
             0, -1,  0
          ];
          const src = context.getImageData(0, 0, w, h);
          const sD = src.data;
          const dst = context.createImageData(w, h);
          const dD = dst.data;
          
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const dstOff = (y * w + x) * 4;
              let r = 0, g = 0, b = 0;
              for (let cy = 0; cy < 3; cy++) {
                for (let cx = 0; cx < 3; cx++) {
                  const scy = Math.min(h - 1, Math.max(0, y + cy - 1));
                  const scx = Math.min(w - 1, Math.max(0, x + cx - 1));
                  const srcOff = (scy * w + scx) * 4;
                  const wt = weights[cy * 3 + cx];
                  r += sD[srcOff] * wt;
                  g += sD[srcOff + 1] * wt;
                  b += sD[srcOff + 2] * wt;
                }
              }
              dD[dstOff] = Math.min(255, Math.max(0, r));
              dD[dstOff + 1] = Math.min(255, Math.max(0, g));
              dD[dstOff + 2] = Math.min(255, Math.max(0, b));
              dD[dstOff + 3] = 255;
            }
          }
          context.putImageData(dst, 0, 0);
        };

        sharpen(ctx, tempCanvas.width, tempCanvas.height);

        return {
          id: c.id,
          dataUrl: tempCanvas.toDataURL('image/png')
        };
      } catch (err) {
        // Исключение при cross-origin canvas
        return {
          id: c.id,
          dataUrl: null,
          error: err.message
        };
      }
    }).filter(Boolean);
  });

  if (canvasesData.length === 0) {
    logger.info('Подходящих canvas-элементов не найдено.');
    return;
  }

  logger.info(`Найдено ${canvasesData.length} canvas-элементов. Запуск Tesseract.js...`);

  // Инициализируем Tesseract.js воркер
  let worker;
  try {
    worker = await createWorker('rus+eng');
  } catch (err) {
    logger.error('Не удалось инициализировать Tesseract.js воркер:', err);
    return;
  }

  for (const canvasData of canvasesData) {
    if (!canvasData.dataUrl) {
      logger.warn(`Пропуск canvas ${canvasData.id} (ошибка доступа к пикселям: cross-origin/protected)`);
      continue;
    }

    try {
      logger.info(`Распознавание содержимого canvas (${canvasData.id})...`);
      
      // Выполняем распознавание
      const { data: { text } } = await worker.recognize(canvasData.dataUrl);
      const cleanedText = text.trim();

      if (cleanedText) {
        logger.success(`Распознан текст: "${cleanedText.replace(/\n/g, ' ').substr(0, 60)}..."`);
        
        // Заменяем canvas на текстовый блок в DOM страницы
        await page.evaluate(({ id, ocrText }) => {
          let canvasEl = document.querySelector(`[data-webgrab-ocr-id="${id}"]`) || 
                         (() => {
                           let foundEl = null;
                           const traverse = (root) => {
                             const el = root.querySelector(`[data-webgrab-ocr-id="${id}"]`);
                             if (el) { foundEl = el; return; }
                             const all = root.querySelectorAll('*');
                             for (const child of all) {
                               if (child.shadowRoot) traverse(child.shadowRoot);
                             }
                           };
                           traverse(document);
                           return foundEl;
                         })();

          if (canvasEl) {
            const container = document.createElement('div');
            container.className = 'webgrab-ocr-text';
            container.style.whiteSpace = 'pre-wrap';
            container.style.margin = '10px 0';
            container.style.padding = '8px';
            container.style.border = '1px dashed #3b82f6';
            container.style.backgroundColor = 'rgba(59, 130, 246, 0.05)';
            container.textContent = ocrText;
            
            canvasEl.replaceWith(container);
          }
        }, { id: canvasData.id, ocrText: cleanedText });
      } else {
        logger.info(`Canvas (${canvasData.id}) не содержит распознаваемого текста.`);
      }
    } catch (err) {
      logger.error(`Ошибка при распознавании canvas ${canvasData.id}:`, err);
    }
  }

  try {
    await worker.terminate();
  } catch (e) {
    // Игнорируем
  }
}
