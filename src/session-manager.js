import fs from 'fs';
import { logger } from './utils.js';

/**
 * Сохраняет полную сессию (cookies + localStorage + sessionStorage) в файл.
 * 
 * @param {import('playwright').BrowserContext} context - Контекст Playwright
 * @param {import('playwright').Page} page - Страница Playwright
 * @param {string} filePath - Путь для сохранения JSON
 */
export async function saveSession(context, page, filePath) {
  try {
    logger.info(`Сохранение сессии в: ${filePath}`);
    
    // Получаем cookies и localStorage стандартным методом Playwright
    const state = await context.storageState();

    // Получаем sessionStorage через выполнение JS на странице
    const sessionStorageData = await page.evaluate(() => {
      const data = {};
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i);
        data[key] = window.sessionStorage.getItem(key);
      }
      return data;
    });

    // Объединяем данные
    const sessionData = {
      ...state,
      sessionStorage: sessionStorageData,
      savedAt: Date.now()
    };

    fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2), 'utf-8');
    logger.success(`Сессия успешно сохранена (${state.cookies.length} кук, ${state.origins.length} источников localStorage).`);
  } catch (err) {
    logger.error(`Ошибка при сохранении сессии: ${err.message}`, err);
  }
}

/**
 * Загружает состояние сессии из файла.
 * Возвращает объект, готовый для передачи в newContext/launchPersistentContext,
 * а также данные sessionStorage.
 * 
 * @param {string} filePath - Путь к файлу сессии
 * @returns {object|null} Данные сессии { storageState, sessionStorage } или null
 */
export function loadSession(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      logger.warn(`Файл сессии не найден: ${filePath}`);
      return null;
    }

    logger.info(`Загрузка сессии из: ${filePath}`);
    const content = fs.readFileSync(filePath, 'utf-8');
    const sessionData = JSON.parse(content);

    // Валидация времени жизни сессии (опционально)
    if (sessionData.savedAt) {
      const ageHours = (Date.now() - sessionData.savedAt) / (1000 * 60 * 60);
      if (ageHours > 24) {
        logger.warn(`Внимание: сессия была сохранена ${Math.floor(ageHours)} ч. назад и могла устареть.`);
      }
    }

    // Разделяем storageState для Playwright и sessionStorage для ручной инъекции
    const storageState = {
      cookies: sessionData.cookies || [],
      origins: sessionData.origins || []
    };

    return {
      storageState,
      sessionStorage: sessionData.sessionStorage || {}
    };
  } catch (err) {
    logger.error(`Ошибка при загрузке сессии: ${err.message}`, err);
    return null;
  }
}

/**
 * Выполняет инъекцию sessionStorage на страницу при инициализации.
 * 
 * @param {import('playwright').Page} page 
 * @param {object} sessionStorageData 
 */
export async function injectSessionStorage(page, sessionStorageData) {
  if (!sessionStorageData || Object.keys(sessionStorageData).length === 0) return;

  try {
    await page.addInitScript((data) => {
      for (const [key, value] of Object.entries(data)) {
        window.sessionStorage.setItem(key, value);
      }
    }, sessionStorageData);
    logger.info('Выполнена инъекция sessionStorage.');
  } catch (err) {
    logger.warn(`Не удалось применить sessionStorage: ${err.message}`);
  }
}
