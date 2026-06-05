import { describe, it, expect } from 'vitest';
import { sanitizeFilename, formatFileSize } from '../../src/utils.js';

describe('sanitizeFilename', () => {
  it('возвращает значение по умолчанию для пустой строки', () => {
    expect(sanitizeFilename('')).toBe('webgrab_page');
  });

  it('возвращает значение по умолчанию для null', () => {
    expect(sanitizeFilename(null)).toBe('webgrab_page');
  });

  it('возвращает значение по умолчанию для undefined', () => {
    expect(sanitizeFilename(undefined)).toBe('webgrab_page');
  });

  it('заменяет спецсимволы Windows на подчёркивания', () => {
    const result = sanitizeFilename('файл\\путь/к:файлу*вопрос?"кавычки<угол>палка|');
    expect(result).not.toMatch(/[\\/:*?"<>|]/);
    // Проверяем, что символы заменены на подчёркивания
    expect(result).toContain('_');
  });

  it('заменяет пробелы на подчёркивания', () => {
    const result = sanitizeFilename('мой файл с пробелами');
    expect(result).toBe('мой_файл_с_пробелами');
  });

  it('обрезает длинные строки до 100 символов', () => {
    const longTitle = 'A'.repeat(200);
    const result = sanitizeFilename(longTitle);
    expect(result.length).toBe(100);
  });

  it('корректно обрабатывает Unicode-символы', () => {
    const result = sanitizeFilename('Привет 世界 مرحبا');
    expect(result).toBe('Привет_世界_مرحبا');
  });

  it('удаляет множественные пробелы (заменяет на один _)', () => {
    const result = sanitizeFilename('файл   с   пробелами');
    expect(result).toBe('файл_с_пробелами');
  });

  it('обрезает пробелы по краям строки', () => {
    const result = sanitizeFilename('  пробелы по краям  ');
    expect(result).toBe('пробелы_по_краям');
  });

  it('конвертирует числовое значение в строку', () => {
    const result = sanitizeFilename(12345);
    expect(result).toBe('12345');
  });
});

describe('formatFileSize', () => {
  it('возвращает "0 B" для нулевого размера', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('корректно форматирует байты', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('корректно форматирует килобайты (1024)', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
  });

  it('корректно форматирует мегабайты (1048576)', () => {
    expect(formatFileSize(1048576)).toBe('1 MB');
  });

  it('корректно форматирует гигабайты (1073741824)', () => {
    expect(formatFileSize(1073741824)).toBe('1 GB');
  });

  it('корректно форматирует дробные значения', () => {
    const result = formatFileSize(1536); // 1.5 KB
    expect(result).toBe('1.5 KB');
  });

  it('корректно форматирует большие мегабайты', () => {
    const result = formatFileSize(5242880); // 5 MB
    expect(result).toBe('5 MB');
  });

  it('корректно округляет до двух знаков после запятой', () => {
    const result = formatFileSize(1234567); // ~1.18 MB
    expect(result).toMatch(/^\d+(\.\d{1,2})? MB$/);
  });
});
