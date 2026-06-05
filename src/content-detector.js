import { logger } from './utils.js';

/**
 * Карта SPA-платформ с CSS-селекторами для извлечения контента.
 * Для каждой платформы задаются:
 *   - match: функция проверки URL / домена
 *   - contentSelectors: селекторы основного контента (по приоритету)
 *   - removeSelectors: селекторы мусорных элементов для удаления
 *   - expandSelectors: селекторы свёрнутых блоков (для клика и раскрытия)
 *   - waitSelector: селектор, появление которого означает готовность контента
 *   - needsDeepScroll: нужен ли глубокий скроллинг с ожиданием подгрузки
 */
export const PLATFORM_RULES = {
  feishu: {
    name: 'Feishu / Lark',
    match: (url) => /feishu\.cn|larksuite\.com|feishu\.com/.test(url),
    contentSelectors: [
      '.wiki-content',
      '.doc-content',
      '[data-page-id]',
      '.lark-editor',
      '.docx-container',
      '.wiki-body',
      '.content-wrapper',
      '.render-unit-wrapper',
      '.doc-block-wrapper',
      // Fallback: общий контейнер документа
      '#WIKI_CONTENT',
      '[class*="wiki"][class*="content"]',
      '[class*="doc"][class*="content"]',
      '[class*="docx"]',
    ],
    removeSelectors: [
      // Навигация и оболочка
      '.wiki-sidebar', '.wiki-nav', '.sidebar',
      '[class*="sidebar"]', '[class*="nav-"]',
      '.catalog-wrapper', '.catalog-panel',
      // Тулбары и хедеры
      '[class*="toolbar"]', '[class*="header-v2"]',
      '.doc-toolbar', '.wiki-header',
      '[class*="topbar"]', '[class*="top-bar"]',
      // Комментарии и реакции
      '[class*="comment"]', '[class*="reaction"]',
      '.comment-panel', '.comment-list',
      // Футер и метаданные UI
      '[class*="footer"]', '[class*="status-bar"]',
      '.doc-footer', '.wiki-footer',
      // Модальные окна
      '[class*="modal"]', '[class*="dialog"]', '[class*="popup"]',
      // Поиск
      '[class*="search"]',
      // Логин-блоки
      '[class*="login"]', '[class*="sign-in"]',
    ],
    expandSelectors: [
      '[aria-expanded="false"]',
      '[class*="collapsed"]',
      'details:not([open])',
      '[class*="fold"]:not([class*="unfold"])',
      '[class*="toggle"][class*="closed"]',
    ],
    waitSelector: '[class*="doc"] [class*="content"], .wiki-content, .docx-container',
    needsDeepScroll: true,
  },

  notion: {
    name: 'Notion',
    match: (url) => /notion\.so|notion\.site/.test(url),
    contentSelectors: [
      '.notion-page-content',
      '.layout-content',
      '[class*="notion-page"]',
      '.notion-scroller',
      'article[class*="page"]',
    ],
    removeSelectors: [
      '.notion-sidebar', '.notion-topbar', '.notion-overlay-container',
      '[class*="sidebar"]', '[class*="topbar"]',
      '[class*="help-button"]', '[class*="intercom"]',
      '.notion-cursor-listener > .notion-topbar',
    ],
    expandSelectors: [
      '[class*="toggle"]:not([class*="open"])',
      'details:not([open])',
      '[aria-expanded="false"]',
    ],
    waitSelector: '.notion-page-content',
    needsDeepScroll: true,
  },

  confluence: {
    name: 'Confluence',
    match: (url) => /confluence|atlassian\.net\/wiki/.test(url),
    contentSelectors: [
      '#main-content',
      '.wiki-content',
      '[data-testid="page-content"]',
      '#content-body',
      '.confluenceTable',
    ],
    removeSelectors: [
      '#header', '#footer', '.aui-sidebar', '#breadcrumbs',
      '.page-metadata', '#likes-and-labels-container',
      '[class*="sidebar"]', '[class*="navigation"]',
    ],
    expandSelectors: [
      '.expand-control:not(.expanded)',
      '[aria-expanded="false"]',
    ],
    waitSelector: '#main-content',
    needsDeepScroll: false,
  },

  yuque: {
    name: 'Yuque (语雀)',
    match: (url) => /yuque\.com/.test(url),
    contentSelectors: [
      '.yuque-doc-content',
      '.ne-viewer-body',
      '#content',
      '[class*="doc-content"]',
      'article',
    ],
    removeSelectors: [
      '[class*="sidebar"]', '[class*="header"]', '[class*="footer"]',
      '[class*="catalog"]', '[class*="toc"]',
      '[class*="comment"]', '[class*="reaction"]',
    ],
    expandSelectors: [
      '[aria-expanded="false"]',
      'details:not([open])',
    ],
    waitSelector: '.yuque-doc-content, .ne-viewer-body',
    needsDeepScroll: true,
  },

  googleDocs: {
    name: 'Google Docs',
    match: (url) => /docs\.google\.com/.test(url),
    contentSelectors: [
      '.kix-appview-editor',
      '.doc-content',
      '[class*="kix-page"]',
    ],
    removeSelectors: [
      '#docs-chrome', '#docs-menubar', '#docs-toolbar',
      '.docs-explore-widget', '[class*="toolbar"]',
    ],
    expandSelectors: [],
    waitSelector: '.kix-appview-editor',
    needsDeepScroll: false,
  },
};

/**
 * Определяет платформу по URL
 * @param {string} url
 * @returns {object|null} Правила платформы или null
 */
export function detectPlatform(url) {
  for (const [key, rules] of Object.entries(PLATFORM_RULES)) {
    if (rules.match(url)) {
      logger.debug(`Обнаружена платформа: ${rules.name}`);
      return { key, ...rules };
    }
  }
  return null;
}

/**
 * Извлекает очищенный HTML основного контента страницы.
 * Используется экспортёрами markdown и text.
 * 
 * @param {import('playwright').Page} page - Страница Playwright
 * @param {object} options - Опции
 * @param {string} [options.selector] - Ручной CSS-селектор контента
 * @param {string} [options.url] - URL страницы для определения платформы
 * @returns {Promise<string>} Очищенный innerHTML основного контента
 */
export async function extractContent(page, options = {}) {
  const url = options.url || page.url();
  const platform = detectPlatform(url);
  const manualSelector = options.selector;

  const contentSelectors = manualSelector
    ? [manualSelector]
    : platform
      ? platform.contentSelectors
      : [];

  const removeSelectors = platform ? platform.removeSelectors : [];

  // Базовые селекторы для любого сайта (если платформа не определена)
  const genericContentSelectors = [
    'article',
    '[role="main"]',
    'main',
    '#content',
    '.content',
    '.post-content',
    '.entry-content',
    '.article-content',
    '.page-content',
    '.post',
    '.entry',
  ];

  const genericRemoveSelectors = [
    'script', 'style', 'noscript', 'iframe:not([src*="youtube"]):not([src*="vimeo"])',
    'svg', 'canvas',
    'nav', 'header', 'footer', 'aside',
    '.sidebar', '#sidebar',
    '.ads', '.ad', '[class*="advert"]',
    '.menu', '.navigation', '.nav',
    '.cookie-consent', '[class*="cookie"]',
    '.social-share', '[class*="social"]',
    '.comments', '#comments', '[class*="comment-"]',
    '[class*="popup"]', '[class*="modal"]',
    '[class*="toast"]', '[class*="notification"]',
    '[class*="breadcrumb"]',
    '[class*="share"]',
    '[class*="related-"]',
    '[aria-hidden="true"]',
  ];

  const allContentSelectors = [...contentSelectors, ...genericContentSelectors];
  const allRemoveSelectors = [...removeSelectors, ...genericRemoveSelectors];

  const cleanedHtml = await page.evaluate(({ contentSels, removeSels }) => {
    // Вспомогательные рекурсивные функции для работы с Shadow DOM
    function getElementText(el) {
      if (el.nodeType === 3) { // TEXT_NODE
        return el.textContent;
      }
      if (el.nodeType !== 1) { // ELEMENT_NODE
        return '';
      }
      let text = '';
      if (el.shadowRoot) {
        for (const child of el.shadowRoot.childNodes) {
          text += getElementText(child);
        }
      }
      for (const child of el.childNodes) {
        text += getElementText(child);
      }
      return text;
    }

    function countSelectorRecursive(el, selector) {
      let count = 0;
      try {
        if (el.matches && el.matches(selector)) {
          count++;
        }
      } catch (e) {}

      if (el.shadowRoot) {
        for (const child of el.shadowRoot.childNodes) {
          count += countSelectorRecursive(child, selector);
        }
      }
      for (const child of el.childNodes) {
        count += countSelectorRecursive(child, selector);
      }
      return count;
    }

    function querySelectorIncludingShadow(root, selector) {
      try {
        const el = root.querySelector(selector);
        if (el) return el;
      } catch (e) {}

      const elements = root.querySelectorAll('*');
      for (const el of elements) {
        if (el.shadowRoot) {
          const found = querySelectorIncludingShadow(el.shadowRoot, selector);
          if (found) return found;
        }
      }
      return null;
    }

    function findAllCandidatesIncludingShadow(root = document) {
      const candidates = [];
      const tags = ['div', 'section', 'article', 'main'];
      
      function traverse(node) {
        if (node.nodeType === 1) {
          const tag = node.tagName.toLowerCase();
          if (tags.includes(tag) || node.getAttribute('role') === 'main') {
            candidates.push(node);
          }
          if (node.shadowRoot) {
            traverse(node.shadowRoot);
          }
        }
        for (const child of node.childNodes) {
          traverse(child);
        }
      }
      
      traverse(root);
      return candidates;
    }

    function serializeWithShadowDOM(el, removeSels) {
      if (el.nodeType === 3) { // TEXT_NODE
        return el.textContent;
      }
      if (el.nodeType !== 1) { // ELEMENT_NODE
        return '';
      }

      // Проверяем, нужно ли удалить этот элемент
      for (const sel of removeSels) {
        try {
          if (el.matches(sel)) return '';
        } catch (e) {}
      }

      const tagName = el.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'svg', 'canvas'].includes(tagName)) {
        if (tagName === 'iframe') {
          const src = el.getAttribute('src') || '';
          if (!src.includes('youtube') && !src.includes('vimeo')) {
            return '';
          }
        } else {
          return '';
        }
      }

      // Проверяем, скрыт ли элемент
      const style = el.getAttribute('style') || '';
      if (/display\s*:\s*none/i.test(style)) {
        return '';
      }

      let innerHtml = '';
      if (el.shadowRoot) {
        const shadowChildren = Array.from(el.shadowRoot.childNodes);
        for (const child of shadowChildren) {
          innerHtml += serializeWithShadowDOM(child, removeSels);
        }
      }
      
      const children = Array.from(el.childNodes);
      for (const child of children) {
        innerHtml += serializeWithShadowDOM(child, removeSels);
      }

      // Сохраняем тег и основные атрибуты для поддержания структуры
      if (['p', 'div', 'section', 'article', 'main', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'span', 'pre', 'code', 'blockquote', 'a', 'img'].includes(tagName)) {
        let attrs = '';
        if (tagName === 'a' && el.hasAttribute('href')) {
          attrs += ` href="${el.getAttribute('href')}"`;
        }
        if (tagName === 'img') {
          let src = el.getAttribute('src') || '';
          if (el.dataset && el.dataset.src) src = el.dataset.src;
          attrs += ` src="${src}"`;
          if (el.getAttribute('alt')) attrs += ` alt="${el.getAttribute('alt')}"`;
          return `<img${attrs} />`;
        }
        return `<${tagName}${attrs}>${innerHtml}</${tagName}>`;
      }
      return innerHtml;
    }

    /**
     * Эвристика: находим самый содержательный блок в DOM.
     */
    function findBestContentBlock() {
      const candidates = findAllCandidatesIncludingShadow(document);
      let bestElement = null;
      let bestScore = 0;

      for (const el of candidates) {
        const text = getElementText(el);
        if (text.trim().length < 200) continue;

        const tag = el.tagName.toLowerCase();
        if (['nav', 'header', 'footer', 'aside'].includes(tag)) continue;

        const classList = (el.className || '').toString().toLowerCase();
        if (/nav|menu|sidebar|footer|header|toolbar|topbar/.test(classList)) continue;

        let score = text.length;

        // Бонусы за содержательные элементы внутри
        score += countSelectorRecursive(el, 'h1, h2, h3, h4, h5, h6') * 500;
        score += countSelectorRecursive(el, 'p') * 100;
        score += countSelectorRecursive(el, 'ul, ol') * 200;
        score += countSelectorRecursive(el, 'table') * 300;
        score += countSelectorRecursive(el, 'pre, code') * 200;

        if (el === document.body) {
          score *= 0.5;
        }

        const rect = el.getBoundingClientRect();
        if (rect.height > document.documentElement.scrollHeight * 0.95) {
          score *= 0.6;
        }

        if (score > bestScore) {
          bestScore = score;
          bestElement = el;
        }
      }

      return bestElement;
    }

    // 1. Пытаемся найти контент по селекторам
    let mainElement = null;
    for (const selector of contentSels) {
      const el = querySelectorIncludingShadow(document, selector);
      if (el && getElementText(el).trim().length > 50) {
        mainElement = el;
        break;
      }
    }

    // 2. Fallback: эвристический поиск
    if (!mainElement) {
      mainElement = findBestContentBlock();
    }

    // 3. Совсем fallback: body
    if (!mainElement) {
      mainElement = document.body;
    }

    // Возвращаем сериализованный HTML с учетом Shadow DOM
    return serializeWithShadowDOM(mainElement, removeSels);
  }, { contentSels: allContentSelectors, removeSels: allRemoveSelectors });

  if (options.decodeFonts) {
    const { getDecodedFontMap, deobfuscateText } = await import('./font-decoder.js');
    const fontMap = await getDecodedFontMap(page);
    return deobfuscateText(cleanedHtml, fontMap);
  }

  return cleanedHtml;
}

/**
 * Раскрывает все свёрнутые блоки на странице.
 * Кликает по аккордеонам, details/summary, toggle-блокам.
 * 
 * @param {import('playwright').Page} page
 * @param {object} [platform] - Правила платформы (или null)
 */
export async function expandCollapsedContent(page, platform = null) {
  const expandSelectors = platform?.expandSelectors || [];

  // Универсальные селекторы для раскрытия
  const genericExpandSelectors = [
    'details:not([open])',
    '[aria-expanded="false"]',
    '[class*="collapsed"]:not([class*="expand"])',
    '[class*="toggle"][class*="closed"]',
    '[class*="accordion"]:not([class*="open"]):not([class*="active"])',
    'summary',
  ];

  const allExpandSelectors = [...expandSelectors, ...genericExpandSelectors];

  let expandedCount = 0;
  const MAX_EXPAND_ITERATIONS = 5; // Рекурсивные свёрнутые блоки

  for (let iteration = 0; iteration < MAX_EXPAND_ITERATIONS; iteration++) {
    const count = await page.evaluate((selectors) => {
      let clicked = 0;

      for (const sel of selectors) {
        try {
          const elements = document.querySelectorAll(sel);
          for (const el of elements) {
            // Для <details> — просто открываем
            if (el.tagName === 'DETAILS') {
              el.setAttribute('open', '');
              clicked++;
              continue;
            }

            // Для summary — кликаем если parent details не open
            if (el.tagName === 'SUMMARY') {
              const details = el.closest('details');
              if (details && !details.hasAttribute('open')) {
                el.click();
                clicked++;
              }
              continue;
            }

            // Для aria-expanded — кликаем
            if (el.getAttribute('aria-expanded') === 'false') {
              el.click();
              clicked++;
              continue;
            }

            // Для остальных — кликаем
            try {
              el.click();
              clicked++;
            } catch (e) {
              // Элемент может быть не интерактивным
            }
          }
        } catch (e) {
          // Невалидный селектор
        }
      }

      return clicked;
    }, allExpandSelectors);

    expandedCount += count;

    if (count === 0) break;

    // Ждём подгрузки контента после раскрытия
    await page.waitForTimeout(500);
  }

  if (expandedCount > 0) {
    logger.info(`Раскрыто ${expandedCount} свёрнутых блоков.`);
  }
}
