import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { chromium } from 'playwright';
import { applyStealth } from '../../src/stealth.js';
import { extractContent } from '../../src/content-detector.js';
import { fetchPage } from '../../src/http-client.js';

let server;
let serverPort;
let browser;

function createTestServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      
      // Страница для проверки Shadow DOM
      if (req.url === '/shadow.html') {
        res.end(`
          <html>
            <body>
              <div id="host"></div>
              <script>
                const host = document.getElementById('host');
                const shadow = host.attachShadow({ mode: 'open' });
                shadow.innerHTML = '<p>TEXT_INSIDE_SHADOW_DOM</p>';
              </script>
            </body>
          </html>
        `);
      } else {
        res.end('<html><body><h1>Hello World</h1></body></html>');
      }
    });

    srv.listen(0, '127.0.0.1', () => {
      resolve({ server: srv, port: srv.address().port });
    });
  });
}

describe('Интеграционные тесты обхода защит (Bypass Integration)', () => {
  beforeAll(async () => {
    const srv = await createTestServer();
    server = srv.server;
    serverPort = srv.port;
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) server.close();
  });

  describe('Stealth Режим', () => {
    it('подменяет свойства navigator.webdriver и navigator.plugins', async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      
      await applyStealth(page, {
        platform: 'TestPlatform',
        languages: ['ru']
      });

      await page.goto(`http://127.0.0.1:${serverPort}/`);

      const webdriver = await page.evaluate(() => navigator.webdriver);
      const platform = await page.evaluate(() => navigator.platform);
      const languages = await page.evaluate(() => navigator.languages);

      expect(webdriver).toBe(false);
      expect(platform).toBe('TestPlatform');
      expect(languages).toContain('ru');

      await context.close();
    });
  });

  describe('Извлечение контента из Shadow DOM', () => {
    it('успешно извлекает текст, находящийся внутри Shadow Root', async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      
      await page.goto(`http://127.0.0.1:${serverPort}/shadow.html`);
      
      const content = await extractContent(page);
      
      expect(content).toContain('TEXT_INSIDE_SHADOW_DOM');
      
      await context.close();
    });
  });

  describe('Легковесный HTTP клиент', () => {
    it('успешно скачивает HTML страницы без использования браузера', async () => {
      const html = await fetchPage(`http://127.0.0.1:${serverPort}/`);
      
      expect(html).toContain('Hello World');
    });
  });
});
