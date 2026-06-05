import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './utils.js';

/**
 * Возвращает путь к профилю указанного браузера на Windows
 * @param {string} browserName - 'chrome', 'edge' или 'firefox'
 * @returns {string|null} - Путь к папке профиля или null
 */
export function getBrowserProfilePath(browserName) {
  const home = os.homedir();
  
  if (browserName === 'chrome') {
    const p = path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
    if (fs.existsSync(p)) return p;
  } else if (browserName === 'edge') {
    const p = path.join(home, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data');
    if (fs.existsSync(p)) return p;
  } else if (browserName === 'firefox') {
    const firefoxDir = path.join(home, 'AppData', 'Roaming', 'Mozilla', 'Firefox', 'Profiles');
    if (fs.existsSync(firefoxDir)) {
      const profiles = fs.readdirSync(firefoxDir);
      // Ищем дефолтный профиль
      const defaultProfile = profiles.find(dir => dir.endsWith('.default') || dir.endsWith('.default-release'));
      if (defaultProfile) {
        return path.join(firefoxDir, defaultProfile);
      }
    }
  }
  return null;
}

/**
 * Загружает cookies из JSON файла
 * @param {string} filePath - Путь к JSON файлу с cookies
 * @returns {Array} - Массив объектов cookies для Playwright
 */
export function loadCookiesFromFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Файл не найден: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    // Поддержка двух форматов:
    // 1. Формат Playwright: { cookies: [...] }
    // 2. Обычный массив: [...]
    let cookies = Array.isArray(data) ? data : data.cookies;
    
    if (!Array.isArray(cookies)) {
      throw new Error('Некорректный формат файла. Ожидался массив cookies.');
    }

    // Приводим куки к формату Playwright
    return cookies.map(c => {
      // Исключаем лишние или несовместимые поля (например, storeId, hostOnly)
      const cleanCookie = {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/'
      };
      
      if (c.expires !== undefined) cleanCookie.expires = c.expires;
      if (c.httpOnly !== undefined) cleanCookie.httpOnly = c.httpOnly;
      if (c.secure !== undefined) cleanCookie.secure = c.secure;
      if (c.sameSite !== undefined) cleanCookie.sameSite = c.sameSite;
      
      return cleanCookie;
    });
  } catch (err) {
    logger.error(`Ошибка при загрузке cookies из файла ${filePath}:`, err);
    throw err;
  }
}
