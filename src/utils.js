import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

/**
 * Очищает заголовок страницы для использования в качестве безопасного имени файла
 * @param {string} title 
 * @returns {string}
 */
export function sanitizeFilename(title) {
  if (!title) return 'webgrab_page';
  return title
    .toString()
    .trim()
    .replace(/[\\\/:*?"<>|]/g, '_') // Заменяем недопустимые в Windows символы
    .replace(/\s+/g, '_')           // Заменяем пробелы на подчеркивания
    .substring(0, 100);             // Ограничиваем длину
}

/**
 * Форматирует размер файла в удобочитаемый формат
 * @param {number} bytes 
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Системное логирование
 */
export const logger = {
  info: (msg) => console.log(chalk.blue('ℹ ') + msg),
  success: (msg) => console.log(chalk.green('✔ ') + msg),
  warn: (msg) => console.log(chalk.yellow('⚠ ') + msg),
  error: (msg, err) => {
    console.error(chalk.red('✖ ') + msg);
    if (err && process.env.VERBOSE) {
      console.error(chalk.red(err.stack || err));
    }
  },
  debug: (msg) => {
    if (process.env.VERBOSE) {
      console.log(chalk.gray('⚙ [DEBUG] ') + msg);
    }
  }
};
