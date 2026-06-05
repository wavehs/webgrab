import { logger } from './utils.js';
import { getBrowserProfile } from './fingerprint.js';

/**
 * Выполняет легковесный запрос (без запуска браузера) для получения HTML страницы.
 * 
 * @param {string} url - URL страницы
 * @param {object} options - Опции
 * @returns {Promise<string>} HTML код страницы
 */
export async function fetchPage(url, options = {}) {
  const profile = getBrowserProfile(options.profile);
  
  const headers = {
    'User-Agent': options.userAgent || profile.userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': `"${profile.platform === 'Win32' ? 'Windows' : 'macOS'}"`,
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1'
  };

  // Добавляем дополнительные HTTP-заголовки
  if (options.extraHeaders) {
    try {
      let extra = options.extraHeaders;
      if (typeof extra === 'string') {
        extra = JSON.parse(extra);
      }
      Object.assign(headers, extra);
      logger.info('Применены дополнительные заголовки в легковесном http-клиенте.');
    } catch (err) {
      logger.error('Ошибка при разборе --extra-headers в http-клиенте:', err);
    }
  }

  let dispatcher = undefined;
  if (options.proxy) {
    try {
      // Используем ProxyAgent из undici для поддержки прокси в fetch (Node.js >= 18)
      const { ProxyAgent } = await import('undici');
      dispatcher = new ProxyAgent(options.proxy);
      logger.info(`Используем прокси в легковесном http-клиенте: ${options.proxy}`);
    } catch (err) {
      logger.warn('ProxyAgent не может быть загружен из undici. Прокси отключен для fetch.');
    }
  }

  logger.info(`Легковесный запрос к URL: ${url}`);
  
  const timeoutMs = options.timeout ? parseInt(options.timeout) : 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchOptions = {
      headers,
      signal: controller.signal
    };

    if (dispatcher) {
      fetchOptions.dispatcher = dispatcher;
    }

    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    return html;
  } catch (err) {
    clearTimeout(timeoutId);
    logger.error(`Ошибка http-клиента при запросе к ${url}: ${err.message}`);
    throw err;
  }
}
