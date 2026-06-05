# Улучшение обхода защиты копирования и anti-bot evasion в WebGrab

Комплексный план по расширению возможностей проекта WebGrab на основе анализа [instructions.v1.md](file:///C:/Users/Rodion/Documents/ide/projects/webgrab/instructions.v1.md) и текущей кодовой базы.

## Текущее состояние

Проект уже реализует базовые механизмы обхода:
- ✅ CSS-переопределение (`user-select`, `pointer-events`)
- ✅ Перехват event listeners (copy, paste, contextmenu и др.)
- ✅ Удаление overlay/paywall элементов
- ✅ Восстановление скролла и снятие blur-фильтров
- ✅ Обход anti-debugger (`debugger` statement stripping)
- ✅ MutationObserver для динамических overlay
- ✅ Базовая инъекция cookies из JSON
- ✅ Поддержка user-data-dir

## Анализ пробелов

| Тема из инструкций | Статус | Приоритет |
|---|---|---|
| Shadow DOM traversal | ❌ Не реализовано | 🔴 Высокий |
| Canvas OCR extraction | ❌ Не реализовано | 🟡 Средний |
| Font obfuscation decoding | ❌ Не реализовано | 🟡 Средний |
| `navigator.webdriver` patching | ❌ Не реализовано | 🔴 Высокий |
| CDP detection hiding (Runtime.enable) | ❌ Не реализовано | 🔴 Высокий |
| TLS/JA3/JA4 fingerprint spoofing | ❌ Не реализовано | 🟡 Средний |
| Proxy rotation | ❌ Не реализовано | 🔴 Высокий |
| CAPTCHA solving integration | ❌ Не реализовано | 🟡 Средний |
| App-Bound Encryption bypass | ❌ Не реализовано | 🟠 Средне-высокий |
| OS-level cookie extraction | ❌ Не реализовано | 🟠 Средне-высокий |
| Behavioral telemetry simulation | ❌ Не реализовано | 🟡 Средний |
| HTTP/2 settings fingerprinting | ❌ Не реализовано | 🟡 Средний |

---

## Фаза 1: Stealth-режим браузера

> [!IMPORTANT]
> Это самая критичная фаза — без неё многие сайты с Cloudflare/DataDome/Akamai определяют автоматизацию мгновенно.

### Компонент: Stealth Engine

#### [NEW] [stealth.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/src/stealth.js)

Новый модуль stealth-инъекций, внедряемых через `page.addScriptToEvaluateOnNewDocument()`:

- **`navigator.webdriver` патчинг** — удаление/переопределение флага `navigator.webdriver = false`, подмена `Object.getOwnPropertyDescriptor`
- **Plugin/MimeType spoofing** — инъекция фейковых `navigator.plugins` и `navigator.mimeTypes` (Flash, PDF и др.)
- **WebGL fingerprint spoofing** — переопределение `WebGLRenderingContext.getParameter()` для подмены RENDERER и VENDOR строк
- **Canvas fingerprint randomization** — добавление субпиксельного шума в `HTMLCanvasElement.prototype.toDataURL` и `toBlob`
- **Chrome runtime emulation** — создание фейковых `window.chrome.runtime`, `chrome.csi`, `chrome.loadTimes` объектов
- **Permission API spoofing** — переопределение `Permissions.prototype.query` для возврата `state: 'prompt'` вместо автоматических ответов
- **Language/Platform consistency** — синхронизация `navigator.language`, `navigator.platform`, `navigator.hardwareConcurrency` с user-agent

#### [MODIFY] [browser.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/src/browser.js)

- Интеграция вызова `applyStealth(page)` из нового модуля `stealth.js`
- Добавление флага `--stealth` для включения stealth-режима
- Настройка viewport с реалистичными параметрами (1920×1080, deviceScaleFactor: 1)
- Добавление `--extra-headers` для инъекции custom HTTP заголовков (cf_clearance и др.)

---

## Фаза 2: Обход среднеуровневых защит (DOM-манипуляции)

### Компонент: Shadow DOM Traversal

#### [MODIFY] [content-detector.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/src/content-detector.js)

- Рекурсивный обход Shadow DOM деревьев через `element.shadowRoot`
- Извлечение текста из `open` shadow roots
- Обработка вложенных shadow roots (shadow root внутри shadow root)
- Интеграция контента из shadow DOM в общий алгоритм оценки контента

#### [MODIFY] [protection-bypass.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/src/protection-bypass.js)

- Применение CSS-переопределений внутри shadow roots
- Удаление overlay элементов внутри shadow DOM
- Расширение списка overlay-селекторов на основе популярных paywall-фреймворков

---

### Компонент: Canvas OCR Extraction

#### [NEW] [canvas-extractor.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/src/canvas-extractor.js)

Модуль для извлечения текста из `<canvas>` элементов:

- Детектирование `<canvas>` элементов с текстовым контентом (эвристика по размеру, контексту)
- Экспорт canvas в base64 PNG через `canvas.toDataURL('image/png')`
- Интеграция с **Tesseract.js** (WASM-based OCR) для распознавания текста
- Предобработка изображений: конвертация в grayscale, увеличение разрешения (2×), sharpening
- Настраиваемый PSM (Page Segmentation Mode) для оптимизации точности
- CLI флаг `--ocr` для включения OCR-режима

#### Новые зависимости
```
tesseract.js: ^6.0.0
```

---

### Компонент: Font Deobfuscation

#### [NEW] [font-decoder.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/src/font-decoder.js)

Модуль декодирования обфусцированных шрифтов:

- Перехват загрузки web-шрифтов (WOFF/WOFF2) через Playwright network events
- Парсинг CMAP таблиц шрифтов с помощью **opentype.js**
- Построение маппинга `scrambled_codepoint → original_character` на основе glyph names
- Пост-обработка извлечённого текста: замена обфусцированных символов на оригинальные
- Автоматическое определение наличия font obfuscation (сравнение визуального рендера с DOM-текстом)

#### Новые зависимости
```
opentype.js: ^2.0.0
```

---

## Фаза 3: Anti-Bot Evasion (сетевой уровень)

### Компонент: TLS/HTTP Fingerprint Management

#### [NEW] [fingerprint.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/src/fingerprint.js)

Модуль управления отпечатками браузера:

- Набор предустановленных профилей (Chrome Windows, Chrome Mac, Firefox Windows, Safari Mac)
- Каждый профиль включает: User-Agent, viewport, языки, платформу, WebGL vendor/renderer
- Рандомизация характеристик в пределах допустимого диапазона
- CLI флаг `--profile <name>` для выбора профиля

> [!NOTE]
> Полноценный TLS/JA3 spoofing на уровне Playwright невозможен — Playwright использует встроенный Chromium. Для TLS-level spoofing необходим отдельный HTTP-клиент. В рамках этой фазы мы реализуем: (1) согласованные browser fingerprint профили и (2) опциональную интеграцию с `curl_cffi` для headless HTTP-запросов.

#### [NEW] [http-client.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/src/http-client.js)

Альтернативный HTTP-клиент для сценариев, где не нужен рендеринг:

- Обёртка над `fetch`/`undici` с настраиваемыми заголовками
- Поддержка полного набора HTTP/2 заголовков как у реального браузера
- CLI флаг `--no-render` для использования lightweight HTTP вместо Playwright (для text/html форматов)

---

### Компонент: Behavioral Telemetry Simulation

#### [NEW] [behavior.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/src/behavior.js)

Симуляция человеческого поведения для обхода поведенческого анализа:

- Реалистичное движение мыши (Безье-кривые с микро-вариациями)
- Случайный скроллинг страницы с переменной скоростью
- Случайные клики по нейтральным областям
- Переменные задержки между действиями (нормальное распределение)
- CLI флаг `--humanize` для включения поведенческой симуляции
- Настраиваемое время «чтения» перед захватом контента

---

## Фаза 4: Управление сессиями и cookies

### Компонент: Расширенное извлечение cookies

#### [MODIFY] [cookies.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/src/cookies.js)

Расширение модуля cookies:

- **Netscape cookie format** — поддержка `cookies.txt` формата (curl/wget совместимый)
- **Browser cookie extraction** — чтение cookies напрямую из SQLite баз Chrome/Firefox/Edge:
  - Chrome: `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Cookies`
  - Firefox: профильная директория + `cookies.sqlite`
  - Edge: `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Cookies`
- **DPAPI decryption** (Windows) — расшифровка cookies через вызов Windows CryptUnprotectData для версий Chrome до v127
- CLI флаг `--browser-cookies <browser>` для автоматического извлечения cookies из установленного браузера

> [!WARNING]
> **App-Bound Encryption (Chrome v127+):** Полная реализация обхода ABE требует нативного кода (DLL injection, COM IElevator interface). Это выходит за рамки Node.js проекта. Вместо этого рекомендуется:
> 1. Использовать `--user-data-dir` для прямого доступа к профилю пользователя (Playwright наследует расшифрованную сессию)
> 2. Для старых версий Chrome — DPAPI-based расшифровка
> 3. Интеграция с внешними инструментами (`chrome-cookies-secure`, `pycookiecheat`) через child_process при необходимости

#### [NEW] [session-manager.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/src/session-manager.js)

Менеджер сессий для переиспользования аутентифицированных состояний:

- Сохранение полного состояния сессии (cookies + localStorage + sessionStorage) после первого визита
- Загрузка сохранённого состояния для последующих запросов
- CLI флаги `--save-session <path>` и `--load-session <path>`
- Инъекция custom HTTP заголовков (Authorization, cf_clearance и пр.)
- Автоматическая валидация сессии перед использованием (проверка expiration)

---

## Фаза 5: Инфраструктура устойчивости

### Компонент: Proxy Support

#### [NEW] [proxy.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/src/proxy.js)

Модуль управления прокси:

- Поддержка HTTP/HTTPS/SOCKS5 прокси
- Ротация прокси из файла-списка (`--proxy-list <path>`)
- Одиночный прокси (`--proxy <url>`)
- Прокси с аутентификацией (`user:password@host:port`)
- Автоматическая ротация при получении 403/429/challenge responses
- Интеграция с Playwright через `browser.launch({ proxy: {...} })`

#### [MODIFY] [browser.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/src/browser.js)

- Передача конфигурации прокси при запуске браузера
- Retry logic с переключением прокси при блокировке

---

### Компонент: Retry и Error Handling

#### [NEW] [retry.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/src/retry.js)

Умная система повторных попыток:

- Экспоненциальный backoff с jitter
- Детектирование типа блокировки (CAPTCHA page, 403, rate limit, challenge page)
- Автоматическое переключение стратегии при неудаче:
  1. Повтор с тем же прокси
  2. Ротация прокси
  3. Смена fingerprint профиля
  4. Включение behavioral simulation
- Настраиваемое количество попыток (`--retries <n>`, по умолчанию 3)
- Таймауты (`--timeout <ms>`, по умолчанию 30000)

---

### Компонент: CAPTCHA Solving Integration

#### [NEW] [captcha-solver.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/src/captcha-solver.js)

Интеграция с внешними CAPTCHA-солверами:

- Детектирование типа CAPTCHA на странице (Cloudflare Turnstile, hCaptcha, reCAPTCHA)
- API интеграция с сервисами:
  - 2Captcha
  - CapSolver
  - Anti-Captcha
- Получение токена решения и инъекция в форму
- CLI флаги `--captcha-service <name>` и `--captcha-key <api-key>`

> [!NOTE]
> CAPTCHA-солверы — платные сервисы. Интеграция будет реализована как опциональный плагин, который активируется только при явном указании API-ключа.

---

## Фаза 6: Тесты и CLI

### Компонент: Тесты

#### [NEW] [stealth.test.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/tests/unit/stealth.test.js)
- Тесты на корректность stealth-инъекций (navigator.webdriver, plugins, chrome runtime)
- Проверка, что все патчи применяются без ошибок

#### [NEW] [canvas-extractor.test.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/tests/unit/canvas-extractor.test.js)
- Тесты OCR pipeline с тестовым canvas изображением

#### [NEW] [font-decoder.test.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/tests/unit/font-decoder.test.js)
- Тесты CMAP парсинга и маппинга символов

#### [NEW] [proxy.test.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/tests/unit/proxy.test.js)
- Тесты ротации и валидации прокси

#### [NEW] [session-manager.test.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/tests/unit/session-manager.test.js)
- Тесты сохранения/загрузки сессий

#### [MODIFY] [protection-bypass.test.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/tests/unit/protection-bypass.test.js)
- Добавление тестов Shadow DOM bypass

#### [MODIFY] [content-detector.test.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/tests/unit/content-detector.test.js)
- Добавление тестов извлечения контента из Shadow DOM

#### [NEW] [bypass-integration.test.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/tests/integration/bypass-integration.test.js)
- Интеграционные тесты полного pipeline: stealth → bypass → detect → extract

---

### Компонент: CLI

#### [MODIFY] [cli.js](file:///C:/Users/Rodion/.gemini/antigravity/worktrees/webgrab/improve-webgrab-bypass-plan/src/cli.js)

Новые CLI-флаги:

```
Stealth & Evasion:
  --stealth                  Включить stealth-режим (webdriver patching, fingerprint spoofing)
  --profile <name>           Профиль браузера: chrome-win, chrome-mac, firefox-win, safari-mac
  --humanize                 Симуляция человеческого поведения (движение мыши, скролл)

Content Extraction:
  --ocr                      Включить OCR для canvas-элементов (требует tesseract.js)
  --decode-fonts             Включить деобфускацию шрифтов

Session Management:
  --browser-cookies <browser>   Извлечь cookies из браузера: chrome, firefox, edge
  --save-session <path>         Сохранить сессию после загрузки
  --load-session <path>         Загрузить сохранённую сессию
  --extra-headers <json>        Дополнительные HTTP заголовки (JSON строка)

Proxy:
  --proxy <url>              Использовать прокси (http://user:pass@host:port)
  --proxy-list <path>        Файл со списком прокси (ротация)

CAPTCHA:
  --captcha-service <name>   Сервис CAPTCHA: 2captcha, capsolver, anticaptcha
  --captcha-key <key>        API-ключ CAPTCHA сервиса

Reliability:
  --retries <n>              Количество повторных попыток (по умолчанию: 3)
  --timeout <ms>             Таймаут загрузки страницы (по умолчанию: 30000)
  --verbose                  Подробный вывод для отладки
```

---

## Open Questions

> [!IMPORTANT]
> **Camoufox vs Playwright Stealth:** Инструкции описывают Camoufox как идеальный anti-detect браузер. Однако его интеграция потребует полной замены Playwright-бэкенда на Firefox + Camoufox. Стоит ли реализовывать поддержку Camoufox как альтернативного бэкенда (`--engine camoufox`), или ограничиться JS-level stealth патчами поверх Playwright Chromium?

> [!IMPORTANT]
> **curl_cffi интеграция:** Для TLS-level spoofing инструкции рекомендуют `curl_cffi` (Python). В Node.js эквивалент — вызов через child_process или использование нативного `curl-impersonate`. Нужно ли реализовывать headless HTTP mode с TLS spoofing, или Playwright с stealth-патчами достаточно для большинства сценариев?

> [!WARNING]
> **App-Bound Encryption:** Полная реализация обхода ABE из Node.js крайне сложна (требуется нативный C++ модуль или DLL). Предложенный подход — использовать `--user-data-dir` для наследования расшифрованной сессии от запущенного Chrome. Это приемлемо?

---

## План верификации

### Автоматизированные тесты
```bash
npm run test:unit        # Unit-тесты всех новых модулей
npm run test:integration # Интеграционные тесты pipeline
npm run test:e2e         # E2E тесты CLI с новыми флагами
npm run test:coverage    # Покрытие кода
```

### Ручная проверка
- Тест stealth-режима на [bot detection sites](https://bot.sannysoft.com/) и [Cloudflare challenge page](https://nowsecure.nl/)
- Тест OCR на страницах с canvas-рендерингом текста
- Тест прокси-ротации с реальным списком прокси
- Тест cookie extraction из установленного Chrome
- Тест поведенческой симуляции на DataDome-защищённых сайтах

---

## Порядок реализации

```mermaid
gantt
    title Порядок реализации фаз
    dateFormat X
    axisFormat %s

    section Фаза 1
    stealth.js + browser.js mod    :f1, 0, 3
    
    section Фаза 2
    Shadow DOM traversal           :f2a, 3, 5
    canvas-extractor.js (OCR)      :f2b, 3, 6
    font-decoder.js                :f2c, 5, 7
    
    section Фаза 3
    fingerprint.js + http-client   :f3a, 7, 9
    behavior.js                    :f3b, 7, 9
    
    section Фаза 4
    cookies.js расширение          :f4a, 9, 11
    session-manager.js             :f4b, 9, 11
    
    section Фаза 5
    proxy.js + retry.js            :f5, 11, 13
    captcha-solver.js              :f5b, 13, 14
    
    section Фаза 6
    Тесты + CLI обновления         :f6, 14, 16
```

## Итого новых/изменённых файлов

| Действие | Файл | Фаза |
|---|---|---|
| [NEW] | `src/stealth.js` | 1 |
| [NEW] | `src/canvas-extractor.js` | 2 |
| [NEW] | `src/font-decoder.js` | 2 |
| [NEW] | `src/fingerprint.js` | 3 |
| [NEW] | `src/http-client.js` | 3 |
| [NEW] | `src/behavior.js` | 3 |
| [NEW] | `src/session-manager.js` | 4 |
| [NEW] | `src/proxy.js` | 5 |
| [NEW] | `src/retry.js` | 5 |
| [NEW] | `src/captcha-solver.js` | 5 |
| [MODIFY] | `src/browser.js` | 1, 5 |
| [MODIFY] | `src/protection-bypass.js` | 2 |
| [MODIFY] | `src/content-detector.js` | 2 |
| [MODIFY] | `src/cookies.js` | 4 |
| [MODIFY] | `src/cli.js` | 6 |
| [MODIFY] | `package.json` | 2 |
| [NEW] | `tests/unit/stealth.test.js` | 6 |
| [NEW] | `tests/unit/canvas-extractor.test.js` | 6 |
| [NEW] | `tests/unit/font-decoder.test.js` | 6 |
| [NEW] | `tests/unit/proxy.test.js` | 6 |
| [NEW] | `tests/unit/session-manager.test.js` | 6 |
| [MODIFY] | `tests/unit/protection-bypass.test.js` | 6 |
| [MODIFY] | `tests/unit/content-detector.test.js` | 6 |
| [NEW] | `tests/integration/bypass-integration.test.js` | 6 |

**Новые зависимости:**
- `tesseract.js` ^6.0.0 — OCR для canvas
- `opentype.js` ^2.0.0 — парсинг шрифтов (cmap)
