import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadCookiesFromFile } from '../../src/cookies.js';

describe('loadCookiesFromFile', () => {
  let tmpDir;

  beforeEach(() => {
    // Создаём временную директорию для тестовых файлов
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webgrab-test-cookies-'));
  });

  afterEach(() => {
    // Удаляем временную директорию
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('корректно загружает cookies в формате Playwright ({ cookies: [...] })', () => {
    const cookieData = {
      cookies: [
        {
          name: 'session',
          value: 'abc123',
          domain: '.example.com',
          path: '/',
          httpOnly: true,
          secure: true,
        },
        {
          name: 'lang',
          value: 'ru',
          domain: '.example.com',
          path: '/app',
        },
      ],
    };

    const filePath = path.join(tmpDir, 'playwright-cookies.json');
    fs.writeFileSync(filePath, JSON.stringify(cookieData), 'utf-8');

    const result = loadCookiesFromFile(filePath);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: 'session',
      value: 'abc123',
      domain: '.example.com',
      path: '/',
      httpOnly: true,
      secure: true,
    });
    expect(result[1]).toEqual({
      name: 'lang',
      value: 'ru',
      domain: '.example.com',
      path: '/app',
    });
  });

  it('корректно загружает cookies в формате массива ([...])', () => {
    const cookieData = [
      {
        name: 'token',
        value: 'xyz789',
        domain: '.test.com',
        path: '/',
        expires: 1700000000,
        sameSite: 'Lax',
      },
    ];

    const filePath = path.join(tmpDir, 'array-cookies.json');
    fs.writeFileSync(filePath, JSON.stringify(cookieData), 'utf-8');

    const result = loadCookiesFromFile(filePath);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'token',
      value: 'xyz789',
      domain: '.test.com',
      path: '/',
      expires: 1700000000,
      sameSite: 'Lax',
    });
  });

  it('выбрасывает ошибку, если файл не найден', () => {
    const fakePath = path.join(tmpDir, 'not-existing.json');

    expect(() => loadCookiesFromFile(fakePath)).toThrow('Файл не найден');
  });

  it('выбрасывает ошибку при невалидном JSON', () => {
    const filePath = path.join(tmpDir, 'invalid.json');
    fs.writeFileSync(filePath, '{ это не json !!!', 'utf-8');

    expect(() => loadCookiesFromFile(filePath)).toThrow();
  });

  it('выбрасывает ошибку при невалидной структуре (не массив)', () => {
    const filePath = path.join(tmpDir, 'bad-structure.json');
    fs.writeFileSync(filePath, JSON.stringify({ data: 'not cookies' }), 'utf-8');

    expect(() => loadCookiesFromFile(filePath)).toThrow('Некорректный формат файла');
  });

  it('устанавливает path по умолчанию "/" если не указан', () => {
    const cookieData = [
      {
        name: 'test',
        value: 'val',
        domain: '.site.com',
        // path не указан
      },
    ];

    const filePath = path.join(tmpDir, 'no-path-cookies.json');
    fs.writeFileSync(filePath, JSON.stringify(cookieData), 'utf-8');

    const result = loadCookiesFromFile(filePath);

    expect(result[0].path).toBe('/');
  });

  it('исключает лишние поля (storeId, hostOnly и т.п.)', () => {
    const cookieData = [
      {
        name: 'clean',
        value: 'test',
        domain: '.site.com',
        path: '/',
        storeId: '0',
        hostOnly: true,
        expirationDate: 1700000000,
      },
    ];

    const filePath = path.join(tmpDir, 'extra-fields.json');
    fs.writeFileSync(filePath, JSON.stringify(cookieData), 'utf-8');

    const result = loadCookiesFromFile(filePath);

    expect(result[0]).not.toHaveProperty('storeId');
    expect(result[0]).not.toHaveProperty('hostOnly');
    expect(result[0]).not.toHaveProperty('expirationDate');
    expect(result[0]).toHaveProperty('name', 'clean');
    expect(result[0]).toHaveProperty('value', 'test');
  });
});
