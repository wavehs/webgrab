import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';

// Импорт экспортёров
import { exportToHtml } from '../../src/exporters/html.js';
import { exportToMarkdown } from '../../src/exporters/markdown.js';
import { exportToText } from '../../src/exporters/text.js';
import { exportToPdf } from '../../src/exporters/pdf.js';
import { exportToScreenshot } from '../../src/exporters/screenshot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, '..', 'fixtures');

// Временная директория для выходных файлов
let tmpDir;
let server;
let serverPort;
let browser;
let context;
let page;

/**
 * Создаёт простой HTTP-сервер, раздающий файлы из папки fixtures
 */
function createStaticServer(dir) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const filePath = path.join(dir, decodeURIComponent(req.url));
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html; charset=utf-8',
          '.css': 'text/css',
          '.js': 'application/javascript',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      }
    });

    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      resolve({ server: srv, port: address.port });
    });

    srv.on('error', reject);
  });
}

describe('Интеграционные тесты экспортёров', () => {
  beforeAll(async () => {
    // Создаём временную директорию для выходных файлов
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webgrab-test-exporters-'));

    // Запускаем HTTP-сервер
    const srv = await createStaticServer(fixturesDir);
    server = srv.server;
    serverPort = srv.port;

    // Запускаем Playwright
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    page = await context.newPage();
  });

  afterAll(async () => {
    // Закрываем браузер
    if (browser) {
      await browser.close();
    }
    // Останавливаем сервер
    if (server) {
      server.close();
    }
    // Удаляем временные файлы
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('HTML экспорт', () => {
    it('экспортирует complex-content.html в HTML-файл', async () => {
      await page.goto(`http://127.0.0.1:${serverPort}/complex-content.html`, { waitUntil: 'load' });
      const outputPath = path.join(tmpDir, 'test-export.html');

      await exportToHtml(page, outputPath);

      // Проверяем, что файл создан
      expect(fs.existsSync(outputPath)).toBe(true);

      const content = fs.readFileSync(outputPath, 'utf-8');

      // Проверяем наличие маркера
      expect(content).toContain('UNIQUE_TEST_MARKER_COMPLEX');

      // Проверяем наличие таблицы
      expect(content).toContain('<table');

      // Проверяем наличие блока кода
      expect(content).toContain('<pre');
    });
  });

  describe('Markdown экспорт', () => {
    it('экспортирует complex-content.html в Markdown-файл', async () => {
      await page.goto(`http://127.0.0.1:${serverPort}/complex-content.html`, { waitUntil: 'load' });
      const outputPath = path.join(tmpDir, 'test-export.md');

      await exportToMarkdown(page, outputPath);

      // Проверяем, что файл создан
      expect(fs.existsSync(outputPath)).toBe(true);

      const content = fs.readFileSync(outputPath, 'utf-8');

      // Проверяем наличие маркера (Turndown экранирует подчёркивания: _ → \_)
      expect(content).toMatch(/UNIQUE.*TEST.*MARKER.*COMPLEX/);

      // Проверяем наличие элементов Markdown-синтаксиса: списки
      expect(content).toMatch(/[-*] /);
    });
  });

  describe('Text экспорт', () => {
    it('экспортирует complex-content.html в текстовый файл без HTML-тегов', async () => {
      await page.goto(`http://127.0.0.1:${serverPort}/complex-content.html`, { waitUntil: 'load' });
      const outputPath = path.join(tmpDir, 'test-export.txt');

      await exportToText(page, outputPath);

      // Проверяем, что файл создан
      expect(fs.existsSync(outputPath)).toBe(true);

      const content = fs.readFileSync(outputPath, 'utf-8');

      // Проверяем наличие маркера
      expect(content).toContain('UNIQUE_TEST_MARKER_COMPLEX');

      // Проверяем, что нет HTML-тегов
      expect(content).not.toMatch(/<[a-z][a-z0-9]*[\s>]/i);
    });
  });

  describe('PDF экспорт', () => {
    it('экспортирует simple-page.html в PDF-файл', async () => {
      await page.goto(`http://127.0.0.1:${serverPort}/simple-page.html`, { waitUntil: 'load' });
      const outputPath = path.join(tmpDir, 'test-export.pdf');

      await exportToPdf(page, outputPath);

      // Проверяем, что файл создан
      expect(fs.existsSync(outputPath)).toBe(true);

      // Проверяем, что размер файла > 1000 байт (PDF не может быть таким маленьким)
      const stats = fs.statSync(outputPath);
      expect(stats.size).toBeGreaterThan(1000);
    });
  });

  describe('Screenshot экспорт', () => {
    it('экспортирует simple-page.html в PNG-скриншот', async () => {
      await page.goto(`http://127.0.0.1:${serverPort}/simple-page.html`, { waitUntil: 'load' });
      const outputPath = path.join(tmpDir, 'test-export.png');

      await exportToScreenshot(page, outputPath);

      // Проверяем, что файл создан
      expect(fs.existsSync(outputPath)).toBe(true);

      // Проверяем PNG-сигнатуру (первые 4 байта: 137, 80, 78, 71)
      const buffer = fs.readFileSync(outputPath);
      expect(buffer[0]).toBe(137);
      expect(buffer[1]).toBe(80);  // P
      expect(buffer[2]).toBe(78);  // N
      expect(buffer[3]).toBe(71);  // G
    });

    it('PNG-скриншот имеет ненулевой размер', async () => {
      await page.goto(`http://127.0.0.1:${serverPort}/simple-page.html`, { waitUntil: 'load' });
      const outputPath = path.join(tmpDir, 'test-export-size.png');

      await exportToScreenshot(page, outputPath);

      const stats = fs.statSync(outputPath);
      expect(stats.size).toBeGreaterThan(1000);
    });
  });
});
