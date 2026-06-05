import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initBrowser, loadPage } from '../../src/browser.js';
import { extractContent, expandCollapsedContent } from '../../src/content-detector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, '..', 'fixtures');

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

describe('E2E тесты полного пайплайна', () => {
  beforeAll(async () => {
    // Запускаем HTTP-сервер
    const srv = await createStaticServer(fixturesDir);
    server = srv.server;
    serverPort = srv.port;

    // Инициализируем браузер через функцию проекта
    const instance = await initBrowser({
      bypass: true,
      scroll: true,
      expand: true,
      deepScroll: true,
      timeout: '30000',
    });
    browser = instance.browser;
    context = instance.context;
    page = instance.page;
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
  });

  describe('Полнота контента SPA', () => {
    it('содержит начальный и ленивый контент после deepScroll', async () => {
      const url = `http://127.0.0.1:${serverPort}/spa-page.html`;

      await loadPage(page, url, {
        bypass: true,
        scroll: true,
        expand: true,
        deepScroll: true,
        timeout: '30000',
      });

      const content = await extractContent(page, { url });

      // Проверяем наличие начального контента
      expect(content).toContain('UNIQUE_TEST_MARKER_SPA_INITIAL');

      // Проверяем наличие ленивого контента (загруженного по таймеру)
      expect(content).toContain('UNIQUE_TEST_MARKER_SPA_LAZY');
    });
  });

  describe('Раскрытие свёрнутых блоков', () => {
    it('содержит контент из свёрнутых details-блоков после expand', async () => {
      const url = `http://127.0.0.1:${serverPort}/collapsed-content.html`;

      await loadPage(page, url, {
        bypass: true,
        scroll: true,
        expand: true,
        timeout: '30000',
      });

      const content = await extractContent(page, { url });

      // Проверяем, что маркер из свёрнутого блока доступен
      expect(content).toContain('UNIQUE_TEST_MARKER_COLLAPSED');
    });
  });

  describe('Обход защиты от копирования', () => {
    it('извлекает контент со страницы с защитой от копирования', async () => {
      const url = `http://127.0.0.1:${serverPort}/protected-page.html`;

      await loadPage(page, url, {
        bypass: true,
        scroll: true,
        expand: true,
        timeout: '30000',
      });

      const content = await extractContent(page, { url });

      // Проверяем, что контент извлечён несмотря на защиту
      expect(content).toContain('UNIQUE_TEST_MARKER_PROTECTED');
    });

    it('разблокирует user-select и overflow после обхода защиты', async () => {
      const url = `http://127.0.0.1:${serverPort}/protected-page.html`;

      await loadPage(page, url, {
        bypass: true,
        scroll: true,
        expand: true,
        timeout: '30000',
      });

      // Проверяем, что bypass удалил прозрачный overlay
      const bypassWorked = await page.evaluate(() => {
        // Overlay должен быть удалён (protection-bypass удаляет fixed+transparent+huge+highZ)
        const overlay = document.getElementById('protection-overlay');
        const overlayRemoved = !overlay || window.getComputedStyle(overlay).display === 'none';

        // user-select должен быть разблокирован (init-скрипт добавляет * { user-select: text !important })
        // Проверяем через стили, а не computed (computed может быть 'auto' на разных движках)
        const hasUserSelectStyle = Array.from(document.querySelectorAll('style')).some(
          style => style.textContent.includes('user-select: text')
        );

        return { overlayRemoved, hasUserSelectStyle };
      });

      expect(bypassWorked.overlayRemoved).toBe(true);
      expect(bypassWorked.hasUserSelectStyle).toBe(true);
    });
  });

  describe('Очистка от мусора', () => {
    it('не включает содержимое навигации и sidebar в основной контент', async () => {
      const url = `http://127.0.0.1:${serverPort}/complex-content.html`;

      await loadPage(page, url, {
        bypass: true,
        scroll: true,
        expand: true,
        timeout: '30000',
      });

      const content = await extractContent(page, { url });

      // Проверяем, что основной контент есть
      expect(content).toContain('UNIQUE_TEST_MARKER_COMPLEX');

      // Проверяем, что навигация удалена (элемент nav с классом .navigation)
      // extractContent удаляет nav, .sidebar элементы
      expect(content).not.toContain('<nav');
      expect(content).not.toContain('class="sidebar"');
    });
  });
});
