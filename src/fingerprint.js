import { logger } from './utils.js';

export const BROWSER_PROFILES = {
  'chrome-win': {
    name: 'chrome-win',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    platform: 'Win32',
    languages: ['ru-RU', 'ru', 'en-US', 'en'],
    viewport: { width: 1920, height: 1080 },
    webgl: {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Intel(R) UHD Graphics (0x9BC4) Direct3D11 vs_5_0 ps_5_0, D3D11)'
    },
    hardwareConcurrency: 8,
    deviceScaleFactor: 1
  },
  'chrome-mac': {
    name: 'chrome-mac',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    platform: 'MacIntel',
    languages: ['ru-RU', 'ru', 'en-US', 'en'],
    viewport: { width: 1440, height: 900 },
    webgl: {
      vendor: 'Apple Inc.',
      renderer: 'Apple M1'
    },
    hardwareConcurrency: 8,
    deviceScaleFactor: 2
  },
  'firefox-win': {
    name: 'firefox-win',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    platform: 'Win32',
    languages: ['ru-RU', 'ru', 'en-US', 'en'],
    viewport: { width: 1920, height: 1080 },
    webgl: {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Intel(R) UHD Graphics (0x9BC4) Direct3D11 vs_5_0 ps_5_0, D3D11)'
    },
    hardwareConcurrency: 8,
    deviceScaleFactor: 1
  },
  'safari-mac': {
    name: 'safari-mac',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
    platform: 'MacIntel',
    languages: ['ru-RU', 'ru', 'en-US', 'en'],
    viewport: { width: 1440, height: 900 },
    webgl: {
      vendor: 'Apple Inc.',
      renderer: 'Apple M1'
    },
    hardwareConcurrency: 8,
    deviceScaleFactor: 2
  }
};

/**
 * Возвращает профиль браузера по имени
 * @param {string} name 
 * @returns {object}
 */
export function getBrowserProfile(name) {
  if (!name) return BROWSER_PROFILES['chrome-win'];
  const normalized = name.toLowerCase();
  
  if (BROWSER_PROFILES[normalized]) {
    return BROWSER_PROFILES[normalized];
  }
  
  // Дополнительный маппинг коротких имен
  if (normalized === 'chrome') return BROWSER_PROFILES['chrome-win'];
  if (normalized === 'firefox') return BROWSER_PROFILES['firefox-win'];
  if (normalized === 'safari') return BROWSER_PROFILES['safari-mac'];
  
  logger.warn(`Профиль браузера "${name}" не найден. Используем по умолчанию chrome-win.`);
  return BROWSER_PROFILES['chrome-win'];
}
