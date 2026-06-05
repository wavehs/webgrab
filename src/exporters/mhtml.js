import fs from 'fs';
import { logger } from '../utils.js';

/**
 * Экспортирует текущую страницу в веб-архив MHTML (доступно только для Chromium)
 * @param {import('playwright').Page} page 
 * @param {string} outputPath 
 * @param {object} options 
 */
export async function exportToMhtml(page, outputPath, options = {}) {
  logger.info(`Экспорт в MHTML: ${outputPath}`);
  
  try {
    // MHTML поддерживается только в Chromium-браузерах
    const browserType = page.context().browser()?.browserType().name();
    if (browserType && browserType !== 'chromium') {
      throw new Error(`Формат MHTML поддерживается только в Chromium (текущий браузер: ${browserType})`);
    }

    // Создаем сессию Chrome DevTools Protocol (CDP)
    const cdpSession = await page.context().newCDPSession(page);
    
    // Захватываем снимок страницы в формате MHTML
    const { data } = await cdpSession.send('Page.captureSnapshot', { format: 'mhtml' });
    
    // Записываем полученные бинарные/текстовые данные в файл
    fs.writeFileSync(outputPath, data, 'utf-8');
    
    // Закрываем CDP сессию
    await cdpSession.detach();
    
    logger.success(`Файл MHTML сохранен: ${outputPath}`);
  } catch (err) {
    logger.error(`Ошибка при экспорте в MHTML: ${err.message}`, err);
    throw err;
  }
}
