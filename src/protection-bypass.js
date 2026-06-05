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

    // Перезаписываем CSS-свойства, отключающие выделение текста
    const style = document.createElement('style');
    style.innerHTML = `
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
    
    // Вставляем стили сразу при готовности документа
    if (document.head) {
      document.head.appendChild(style);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.head.appendChild(style);
      });
    }

    // Подавление Service Worker (если сайт регистрирует SW, который модифицирует ответы)
    if (navigator.serviceWorker) {
      try {
        // Перехватываем регистрацию нового SW
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

// 2. Дополнительные действия после полной загрузки страницы (запускается после перехода на страницу)
export async function bypassPostLoad(page) {
  await page.evaluate(() => {
    // Гарантируем наличие стилей для выделения текста
    const hasStyle = Array.from(document.querySelectorAll('style')).some(
      s => s.textContent.includes('user-select: text')
    );
    if (!hasStyle) {
      const style = document.createElement('style');
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

    // Включаем выделение текста для всех элементов явно через JS
    const allElements = document.getElementsByTagName('*');
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      el.style.setProperty('user-select', 'text', 'important');
      el.style.setProperty('-webkit-user-select', 'text', 'important');
      el.style.setProperty('pointer-events', 'auto', 'important');
    }

    // Принудительная загрузка lazy-изображений
    document.querySelectorAll('img[loading="lazy"]').forEach(img => {
      img.setAttribute('loading', 'eager');
      // Триггерим загрузку для уже вставленных изображений
      if (img.dataset.src) {
        img.src = img.dataset.src;
      }
    });

    // Принудительная загрузка lazy-iframe
    document.querySelectorAll('iframe[loading="lazy"]').forEach(iframe => {
      iframe.setAttribute('loading', 'eager');
    });

    // Снимаем overflow: hidden со всех элементов, а не только body
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      const style = window.getComputedStyle(el);
      if (style.overflow === 'hidden' || style.overflowY === 'hidden') {
        el.style.setProperty('overflow', 'auto', 'important');
        el.style.setProperty('overflow-y', 'auto', 'important');
      }
    }

    // Удаляем прозрачные заглушки, закрывающие контент
    const overlays = Array.from(document.querySelectorAll('*')).filter(el => {
      const style = window.getComputedStyle(el);
      const isFixed = style.position === 'fixed' || style.position === 'absolute';
      const isHuge = parseInt(style.width) > 500 && parseInt(style.height) > 500;
      const isTransparent = style.opacity === '0' || style.backgroundColor === 'transparent' || style.backgroundColor === 'rgba(0, 0, 0, 0)';
      const zIndex = parseInt(style.zIndex) > 10;
      return isFixed && isHuge && isTransparent && zIndex;
    });

    overlays.forEach(el => {
      el.remove();
    });

    // Также удаляем overlay-блоки по распространённым паттернам
    const overlaySelectors = [
      '.overlay', '#overlay',
      '[class*="paywall"]', '[class*="subscribe-wall"]',
      '[class*="reader-wall"]', '[class*="content-gate"]',
      '[class*="login-wall"]', '[class*="registration-wall"]',
    ];
    overlaySelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'absolute') {
          el.remove();
        }
      });
    });

    // Разблокируем прокрутку в html и body
    document.documentElement.style.setProperty('overflow', 'auto', 'important');
    document.body.style.setProperty('overflow', 'auto', 'important');
    document.body.style.setProperty('position', 'static', 'important');
  });
}
