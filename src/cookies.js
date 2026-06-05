import fs from 'fs';
import path from 'path';
import os from 'os';
import { chromium, firefox } from 'playwright';
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
      const defaultProfile = profiles.find(dir => dir.endsWith('.default') || dir.endsWith('.default-release'));
      if (defaultProfile) {
        return path.join(firefoxDir, defaultProfile);
      }
    }
  }
  return null;
}

/**
 * Парсит cookies в формате Netscape (cookies.txt)
 * @param {string} fileContent 
 * @returns {Array}
 */
export function parseNetscapeCookies(fileContent) {
  const cookies = [];
  const lines = fileContent.split('\n');
  
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    
    let isHttpOnly = false;
    if (line.startsWith('#HttpOnly_')) {
      line = line.substring(10);
      isHttpOnly = true;
    } else if (line.startsWith('#')) {
      continue;
    }
    
    const parts = line.split('\t');
    if (parts.length < 7) continue;
    
    const [domain, flag, pathVal, secureFlag, expiration, name, value] = parts;
    
    cookies.push({
      name,
      value,
      domain,
      path: pathVal,
      secure: secureFlag.toUpperCase() === 'TRUE',
      expires: parseInt(expiration, 10),
      httpOnly: isHttpOnly
    });
  }
  return cookies;
}

/**
 * Загружает cookies из JSON или Netscape файла
 * @param {string} filePath - Путь к файлу с cookies
 * @returns {Array} - Массив объектов cookies для Playwright
 */
export function loadCookiesFromFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Файл не найден: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    let cookies = [];

    if (content.trim().startsWith('[') || content.trim().startsWith('{')) {
      const data = JSON.parse(content);
      cookies = Array.isArray(data) ? data : data.cookies;
    } else {
      cookies = parseNetscapeCookies(content);
    }
    
    if (!Array.isArray(cookies)) {
      throw new Error('Некорректный формат файла. Ожидался массив cookies.');
    }

    return cookies.map(c => {
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

/**
 * Извлекает cookies из установленного браузера с помощью временного persistent context
 * @param {string} browserName - 'chrome', 'edge' или 'firefox'
 * @returns {Promise<Array>}
 */
export async function extractBrowserCookies(browserName) {
  const profilePath = getBrowserProfilePath(browserName);
  if (!profilePath) {
    throw new Error(`Профиль браузера ${browserName} не найден.`);
  }

  logger.info(`Извлечение cookies из ${browserName} (${profilePath})...`);
  logger.warn('Закройте этот браузер, если он запущен, во избежание ошибки блокировки профиля.');

  const isFirefox = browserName === 'firefox';
  const driver = isFirefox ? firefox : chromium;

  const context = await driver.launchPersistentContext(profilePath, {
    headless: true,
    args: ['--disable-web-security']
  });

  const cookies = await context.cookies();
  await context.close();

  logger.success(`Успешно извлечено ${cookies.length} cookies из ${browserName}.`);
  return cookies;
}
