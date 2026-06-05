import fs from 'fs';
import { logger } from './utils.js';

/**
 * Парсит строку прокси (например, http://user:pass@host:port или socks5://host:port)
 * в формат, ожидаемый Playwright.
 * 
 * @param {string} proxyStr 
 * @returns {object|null}
 */
export function parseProxy(proxyStr) {
  if (!proxyStr) return null;
  
  try {
    const url = new URL(proxyStr.includes('://') ? proxyStr : 'http://' + proxyStr);
    const proxy = {
      server: `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`
    };
    if (url.username) {
      proxy.username = decodeURIComponent(url.username);
    }
    if (url.password) {
      proxy.password = decodeURIComponent(url.password);
    }
    return proxy;
  } catch (err) {
    logger.error(`Не удалось распарсить прокси "${proxyStr}": ${err.message}`);
    return null;
  }
}

/**
 * Загружает список прокси из текстового файла.
 * 
 * @param {string} filePath 
 * @returns {Array<string>}
 */
export function loadProxyList(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Файл со списком прокси не найден: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const proxies = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    
    logger.info(`Загружено ${proxies.length} прокси из файла: ${filePath}`);
    return proxies;
  } catch (err) {
    logger.error(`Ошибка при загрузке списка прокси: ${err.message}`);
    return [];
  }
}

/**
 * Класс управления ротацией прокси.
 */
export class ProxyRotator {
  constructor(options = {}) {
    this.proxies = [];
    this.currentIndex = 0;
    
    if (options.proxy) {
      this.proxies.push(options.proxy);
    }
    if (options.proxyList) {
      const list = loadProxyList(options.proxyList);
      this.proxies.push(...list);
    }
  }

  /**
   * Проверяет, настроены ли прокси
   * @returns {boolean}
   */
  hasProxies() {
    return this.proxies.length > 0;
  }

  /**
   * Возвращает следующий прокси в списке
   * @returns {string|null}
   */
  getNextProxy() {
    if (this.proxies.length === 0) return null;
    const proxyStr = this.proxies[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    return proxyStr;
  }

  /**
   * Возвращает текущее количество доступных прокси
   * @returns {number}
   */
  count() {
    return this.proxies.length;
  }
}
