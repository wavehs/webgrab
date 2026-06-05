import { logger } from './utils.js';
import { ProxyRotator } from './proxy.js';

/**
 * Определяет тип блокировки по HTTP статусу, заголовку или содержимому страницы.
 * 
 * @param {number} status 
 * @param {string} title 
 * @param {string} html 
 * @returns {string|null}
 */
export function detectBlockType(status, title = '', html = '') {
  const content = (title + ' ' + html).toLowerCase();
  
  if (status === 429) return 'rate_limit';
  
  if (content.includes('cloudflare') || content.includes('ddos') || content.includes('ray id') || content.includes('checking your browser')) {
    return 'cloudflare_challenge';
  }
  
  if (content.includes('datadome') || content.includes('captcha-delivery')) {
    return 'datadome';
  }
  
  if (content.includes('captcha') || content.includes('hcaptcha') || content.includes('recaptcha') || content.includes('turnstile') || content.includes('g-recaptcha')) {
    return 'captcha';
  }

  if (status === 403) return 'forbidden';
  
  return null;
}

/**
 * Обертка для выполнения операции с автоматическими повторами и переключением стратегий.
 * 
 * @param {string} url - Целевой URL
 * @param {object} options - CLI Опции
 * @param {Function} grabFn - Асинхронная функция выполнения (url, currentOptions) => result
 */
export async function executeWithRetry(url, options, grabFn) {
  const maxRetries = options.retries !== undefined ? parseInt(options.retries, 10) : 3;
  let attempt = 0;
  
  const currentOptions = { ...options };
  const rotator = new ProxyRotator(options);

  if (rotator.hasProxies()) {
    currentOptions.proxy = rotator.getNextProxy();
  }

  while (attempt <= maxRetries) {
    attempt++;
    try {
      if (attempt > 1) {
        logger.info(`Повторная попытка ${attempt - 1} из ${maxRetries}...`);
      }
      
      const result = await grabFn(url, currentOptions);
      return result;
    } catch (err) {
      logger.error(`Попытка ${attempt} завершилась неудачей: ${err.message}`);
      
      if (attempt > maxRetries) {
        throw new Error(`Все попытки (${maxRetries + 1}) исчерпаны. Последняя ошибка: ${err.message}`);
      }

      // Экспоненциальный backoff с джиттером
      const baseDelay = 3000;
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      logger.info(`Ожидание перед повтором: ${Math.round(delay)} мс...`);
      await new Promise(r => setTimeout(r, delay));

      // Применение стратегий восстановления:
      // 1. Ротация прокси при наличии
      if (rotator.hasProxies()) {
        const nextProxy = rotator.getNextProxy();
        logger.info(`Стратегия: Ротация прокси -> ${nextProxy}`);
        currentOptions.proxy = nextProxy;
      }

      // 2. Смена профиля отпечатков при последующих попытках
      if (attempt >= 2) {
        const profiles = ['chrome-win', 'chrome-mac', 'firefox-win', 'safari-mac'];
        const currentProfile = currentOptions.profile || 'chrome-win';
        const availableProfiles = profiles.filter(p => p !== currentProfile);
        const randomProfile = availableProfiles[Math.floor(Math.random() * availableProfiles.length)];
        
        logger.info(`Стратегия: Смена профиля отпечатков -> ${randomProfile}`);
        currentOptions.profile = randomProfile;
        
        // Включаем stealth и humanize для надежности
        currentOptions.stealth = true;
        currentOptions.humanize = true;
      }
    }
  }
}
