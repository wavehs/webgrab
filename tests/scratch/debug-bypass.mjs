import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initBrowser, loadPage } from '../../src/browser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '..', 'fixtures');

const srv = http.createServer((req, res) => {
  const fp = path.join(fixturesDir, decodeURIComponent(req.url));
  if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(fp).pipe(res);
  } else {
    res.writeHead(404); res.end('404');
  }
});

srv.listen(0, '127.0.0.1', async () => {
  const port = srv.address().port;
  const opts = { bypass: true, scroll: true, expand: true, deepScroll: true, timeout: '30000' };

  const { browser, page } = await initBrowser(opts);

  // Имитируем E2E: загружаем несколько страниц подряд, как в тестах
  await loadPage(page, `http://127.0.0.1:${port}/spa-page.html`, opts);
  console.log('--- SPA loaded ---');

  await loadPage(page, `http://127.0.0.1:${port}/collapsed-content.html`, opts);
  console.log('--- Collapsed loaded ---');

  await loadPage(page, `http://127.0.0.1:${port}/protected-page.html`, opts);
  console.log('--- Protected loaded (1st time) ---');

  // Теперь 4-я загрузка (как в тесте overlay)
  await loadPage(page, `http://127.0.0.1:${port}/protected-page.html`, opts);
  console.log('--- Protected loaded (2nd time) ---');

  const result = await page.evaluate(() => {
    const bs = window.getComputedStyle(document.body);
    return {
      userSelect: bs.userSelect,
      overflow: bs.overflow,
      stylesCount: document.querySelectorAll('style').length,
    };
  });

  console.log(JSON.stringify(result, null, 2));

  await browser.close();
  srv.close();
});
