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
      [class*="overlay"], [id*="overlay"],
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
    `;
    
    // Вставляем стили сразу при готовности документа
    if (document.head) {
      document.head.appendChild(style);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.head.appendChild(style);
      });
    }
  });

  // 2. Дополнительные действия после полной загрузки страницы
  await page.evaluate(() => {
    // Включаем выделение текста для всех элементов явно через JS
    const allElements = document.getElementsByTagName('*');
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      el.style.setProperty('user-select', 'text', 'important');
      el.style.setProperty('-webkit-user-select', 'text', 'important');
      el.style.setProperty('pointer-events', 'auto', 'important');
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

    // Разблокируем прокрутку в html и body
    document.documentElement.style.setProperty('overflow', 'auto', 'important');
    document.body.style.setProperty('overflow', 'auto', 'important');
  });
}
