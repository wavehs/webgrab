/**
 * Скрипт, который будет внедрен на страницу для обхода различных защит от копирования и оверлеев.
 */
export async function bypassRestrictions(page) {
  // 1. Внедряем скрипт инициализации (срабатывает до загрузки основного JS сайта)
  await page.addInitScript(() => {
    // Отключаем определение автоматизации webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => false });

    // Предотвращаем блокировку событий мыши и клавиатуры, связанных с копированием
    const preventBlock = (e) => {
      e.stopPropagation();
    };

    const eventsToBypass = [
      'contextmenu', 'selectstart', 'copy', 'cut', 'paste', 
      'keydown', 'keyup', 'keypress', 'dragstart', 'mousedown'
    ];

    eventsToBypass.forEach(eventName => {
      document.addEventListener(eventName, preventBlock, true);
    });

    const cssText = `
      * {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
        pointer-events: auto !important;
      }
      /* Скрываем водяные знаки, плавающие окна подписок и оверлеи */
      [class*="watermark"], [id*="watermark"], 
      [class*="overlay"]:not([class*="content"]), [id*="overlay"],
      [class*="paywall"], [id*="paywall"],
      [class*="cookie-consent"], [id*="cookie-consent"],
      .modal-backdrop, .modal, [class*="popup"] {
        display: none !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      body {
        overflow: auto !important;
        position: static !important;
      }
      /* Снимаем overflow: hidden со всех контейнеров */
      [style*="overflow: hidden"], [style*="overflow:hidden"] {
        overflow: auto !important;
      }
      /* Принудительная загрузка lazy-изображений */
      img[loading="lazy"] {
        loading: eager !important;
      }
    `;

    // Перезаписываем CSS-свойства, отключающие выделение текста
    const style = document.createElement('style');
    style.className = 'webgrab-bypass-style';
    style.innerHTML = cssText;
    
    // Вставляем стили сразу при готовности документа
    if (document.head) {
      document.head.appendChild(style);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.head.appendChild(style);
      });
    }

    // Рекурсивная вставка стилей в Shadow DOM по мере их появления
    const injectStylesToShadow = (root) => {
      if (!root) return;
      if (root.shadowRoot) {
        const hasBypassStyle = Array.from(root.shadowRoot.querySelectorAll('style.webgrab-bypass-style')).length > 0;
        if (!hasBypassStyle) {
          const s = document.createElement('style');
          s.className = 'webgrab-bypass-style';
          s.innerHTML = cssText;
          root.shadowRoot.appendChild(s);
        }
        injectStylesToShadow(root.shadowRoot);
      }
      for (const child of root.children || []) {
        injectStylesToShadow(child);
      }
    };

    // Наблюдаем за новыми элементами
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) { // ELEMENT_NODE
            injectStylesToShadow(node);
          }
        }
      }
    });

    document.addEventListener('DOMContentLoaded', () => {
      injectStylesToShadow(document.body);
      observer.observe(document.body, { childList: true, subtree: true });
    });

    // Подавление Service Worker
    if (navigator.serviceWorker) {
      try {
        const origRegister = navigator.serviceWorker.register;
        navigator.serviceWorker.register = function() {
          return Promise.resolve({ installing: null, waiting: null, active: null });
        };
      } catch (e) {
        // Игнорируем ошибки
      }
    }
  });
}

// 2. Дополнительные действия после полной загрузки страницы
export async function bypassPostLoad(page) {
  await page.evaluate(() => {
    // Гарантируем наличие стилей для выделения текста в основном документе
    const hasStyle = Array.from(document.querySelectorAll('style')).some(
      s => s.textContent.includes('user-select: text')
    );
    if (!hasStyle) {
      const style = document.createElement('style');
      style.className = 'webgrab-bypass-style';
      style.innerHTML = `
        * {
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
          user-select: text !important;
          pointer-events: auto !important;
        }
      `;
      const parent = document.head || document.documentElement;
      if (parent) {
        parent.appendChild(style);
      }
    }

    // Вспомогательная функция для рекурсивного обхода DOM и Shadow DOM
    function processNodeAndShadows(root) {
      if (!root) return;
      
      const elements = root.querySelectorAll('*');
      for (const el of elements) {
        // 1. Включаем выделение текста для всех элементов
        el.style.setProperty('user-select', 'text', 'important');
        el.style.setProperty('-webkit-user-select', 'text', 'important');
        el.style.setProperty('pointer-events', 'auto', 'important');
        
        // 2. Снимаем overflow: hidden
        const style = window.getComputedStyle(el);
        if (style.overflow === 'hidden' || style.overflowY === 'hidden') {
          el.style.setProperty('overflow', 'auto', 'important');
          el.style.setProperty('overflow-y', 'auto', 'important');
        }

        // 3. Удаляем прозрачные заглушки, закрывающие контент
        const isFixed = style.position === 'fixed' || style.position === 'absolute';
        const isHuge = parseInt(style.width) > 500 && parseInt(style.height) > 500;
        const isTransparent = style.opacity === '0' || style.backgroundColor === 'transparent' || style.backgroundColor === 'rgba(0, 0, 0, 0)';
        const zIndex = parseInt(style.zIndex) > 10;
        if (isFixed && isHuge && isTransparent && zIndex) {
          el.remove();
          continue;
        }

        // 4. Удаляем overlay-блоки по распространённым паттернам
        const overlaySelectors = [
          '.overlay', '#overlay',
          '[class*="paywall"]', '[class*="subscribe-wall"]',
          '[class*="reader-wall"]', '[class*="content-gate"]',
          '[class*="login-wall"]', '[class*="registration-wall"]',
        ];
        for (const sel of overlaySelectors) {
          try {
            if (el.matches(sel) && (style.position === 'fixed' || style.position === 'absolute')) {
              el.remove();
              break;
            }
          } catch(e) {}
        }

        // 5. Если есть Shadow DOM, обрабатываем его
        if (el.shadowRoot) {
          // Инжектим стиль, если нет
          const hasBypassStyle = Array.from(el.shadowRoot.querySelectorAll('style.webgrab-bypass-style')).length > 0;
          if (!hasBypassStyle) {
            const s = document.createElement('style');
            s.className = 'webgrab-bypass-style';
            s.innerHTML = `
              * {
                -webkit-user-select: text !important;
                -moz-user-select: text !important;
                -ms-user-select: text !important;
                user-select: text !important;
                pointer-events: auto !important;
              }
            `;
            el.shadowRoot.appendChild(s);
          }
          processNodeAndShadows(el.shadowRoot);
        }
      }
    }

    // Запуск процесса для всего документа
    processNodeAndShadows(document.body);

    // Принудительная загрузка lazy-изображений
    document.querySelectorAll('img[loading="lazy"]').forEach(img => {
      img.setAttribute('loading', 'eager');
      if (img.dataset.src) {
        img.src = img.dataset.src;
      }
    });

    // Принудительная загрузка lazy-iframe
    document.querySelectorAll('iframe[loading="lazy"]').forEach(iframe => {
      iframe.setAttribute('loading', 'eager');
    });

    // Разблокируем прокрутку в html и body
    document.documentElement.style.setProperty('overflow', 'auto', 'important');
    document.body.style.setProperty('overflow', 'auto', 'important');
    document.body.style.setProperty('position', 'static', 'important');
  });
}
