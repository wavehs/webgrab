import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { executeGrab } from './cli.js';
import { setLogListener, logger, formatFileSize } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HTML_FILE_PATH = path.join(__dirname, 'gui', 'index.html');

let sseClients = [];
let currentLogHistory = [];

// Подключаем слушатель логов к нашей утилите
setLogListener((logObj) => {
  const sseData = JSON.stringify(logObj);
  currentLogHistory.push(logObj);
  // Ограничиваем историю логов
  if (currentLogHistory.length > 500) {
    currentLogHistory.shift();
  }
  
  // Рассылаем всем подключенным клиентам в GUI
  sseClients.forEach(client => {
    client.write(`data: ${sseData}\n\n`);
  });
});

export async function startGui() {
  const defaultPort = 3000;
  const port = await findFreePort(defaultPort);
  
  const server = http.createServer((req, res) => {
    // Разрешаем CORS на всякий случай
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    
    // Главная страница
    if (req.method === 'GET' && parsedUrl.pathname === '/') {
      fs.readFile(HTML_FILE_PATH, 'utf-8', (err, content) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Ошибка загрузки интерфейса GUI. Убедитесь, что src/gui/index.html существует.');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
      });
      return;
    }

    // SSE-канал для логов
    if (req.method === 'GET' && parsedUrl.pathname === '/api/logs') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      // Отправляем текущую историю логов новому клиенту
      currentLogHistory.forEach(logObj => {
        res.write(`data: ${JSON.stringify(logObj)}\n\n`);
      });

      sseClients.push(res);

      req.on('close', () => {
        sseClients = sseClients.filter(client => client !== res);
      });
      return;
    }

    // API: Получение файлов в директории
    if (req.method === 'GET' && parsedUrl.pathname === '/api/files') {
      const dirQuery = parsedUrl.searchParams.get('dir') || '.';
      const targetDir = path.resolve(dirQuery);
      
      try {
        if (!fs.existsSync(targetDir)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ files: [] }));
          return;
        }

        const files = fs.readdirSync(targetDir)
          .map(file => {
            const filePath = path.join(targetDir, file);
            const stat = fs.statSync(filePath);
            return {
              name: file,
              isFile: stat.isFile(),
              size: stat.isFile() ? formatFileSize(stat.size) : '-',
              sizeBytes: stat.size,
              mtime: stat.mtimeMs
            };
          })
          .filter(f => f.isFile && !f.name.startsWith('.'))
          .sort((a, b) => b.mtime - a.mtime); // Сначала новые

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ files }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // API: Открытие папки в Проводнике
    if (req.method === 'POST' && parsedUrl.pathname === '/api/open-folder') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const targetDir = path.resolve(data.dir || '.');
          if (fs.existsSync(targetDir)) {
            // Открываем папку в Windows Explorer
            exec(`explorer "${targetDir}"`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Папка не существует' }));
          }
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // API: Запуск процесса скачивания
    if (req.method === 'POST' && parsedUrl.pathname === '/api/grab') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const params = JSON.parse(body);
          
          // Очищаем лог-историю перед новым запуском
          currentLogHistory = [];
          sseClients.forEach(client => {
            client.write(`data: ${JSON.stringify({ type: 'clear', message: '' })}\n\n`);
          });

          const { urls, options } = params;

          if (!urls || !Array.isArray(urls) || urls.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Не передан список URL' }));
            return;
          }

          // Запускаем асинхронно
          logger.info(`Запуск задачи захвата страниц из GUI для ${urls.length} URL...`);
          
          // Отправляем ответ, что задача принята
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Задача успешно запущена' }));

          // Выполняем захват
          executeGrab(urls, options).catch(err => {
            logger.error('Ошибка при выполнении GUI-задачи:', err);
          });

        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // 404 Not Found
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Страница не найдена');
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`\n======================================================`);
    console.log(`GUI успешно запущен на ${url}`);
    console.log(`======================================================\n`);

    // Автоматическое открытие в браузере (поддержка Windows)
    exec(`start ${url}`);
  });
}

/**
 * Ищет свободный TCP-порт начиная с указанного
 */
function findFreePort(startPort) {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.on('error', () => {
      resolve(findFreePort(startPort + 1));
    });
    server.on('listening', () => {
      server.close(() => {
        resolve(startPort);
      });
    });
    server.listen(startPort);
  });
}
