import { logger } from './utils.js';

/**
 * Генерирует точки на кубической кривой Безье для плавного движения мыши.
 */
function getBezierPoints(p0, p1, p2, p3, steps = 30) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    
    const x = mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x;
    const y = mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y;
    points.push({ x, y });
  }
  return points;
}

/**
 * Имитирует движение мыши по кривой Безье в указанную координату.
 */
export async function simulateMouseMove(page, targetX, targetY) {
  // Выбираем случайную начальную позицию (если текущая неизвестна)
  const startX = Math.floor(Math.random() * 300) + 50;
  const startY = Math.floor(Math.random() * 300) + 50;
  
  // Контрольные точки для искривления траектории
  const p1 = {
    x: startX + (targetX - startX) * Math.random(),
    y: startY + (targetY - startY) * Math.random()
  };
  const p2 = {
    x: startX + (targetX - startX) * Math.random(),
    y: startY + (targetY - startY) * Math.random()
  };
  
  const points = getBezierPoints(
    { x: startX, y: startY },
    p1,
    p2,
    { x: targetX, y: targetY },
    25
  );
  
  for (const pt of points) {
    try {
      await page.mouse.move(Math.floor(pt.x), Math.floor(pt.y));
      // Небольшая случайная микро-задержка между шагами
      await page.waitForTimeout(Math.floor(Math.random() * 12) + 4);
    } catch (e) {
      // Игнорируем ошибки (например, если контекст закрылся)
      break;
    }
  }
}

/**
 * Выполняет случайный скроллинг страницы с паузами и возвратами назад (имитация чтения).
 */
export async function simulateScrolling(page) {
  try {
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const totalHeight = await page.evaluate(() => document.body.scrollHeight);
    
    if (totalHeight <= viewportHeight) return;

    logger.info('Симуляция скроллинга пользователем...');
    
    let currentScroll = 0;
    const maxScrolls = 20; // Ограничение на количество шагов
    let stepCount = 0;

    while (currentScroll < totalHeight - viewportHeight && stepCount < maxScrolls) {
      const scrollStep = Math.floor(Math.random() * 200) + 150;
      currentScroll = Math.min(totalHeight - viewportHeight, currentScroll + scrollStep);
      
      await page.evaluate((y) => window.scrollTo(0, y), currentScroll);
      stepCount++;

      // Пауза «на чтение»
      await page.waitForTimeout(Math.floor(Math.random() * 1200) + 400);
      
      // С вероятностью 15% скроллим немного назад
      if (Math.random() < 0.15 && currentScroll > 100) {
        const backtrack = Math.floor(Math.random() * 80) + 20;
        currentScroll -= backtrack;
        await page.evaluate((y) => window.scrollTo(0, y), currentScroll);
        await page.waitForTimeout(Math.floor(Math.random() * 500) + 200);
      }
    }
    
    // Возвращаемся в начало для корректного скриншота/PDF
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
  } catch (e) {
    logger.debug('Ошибка симуляции скроллинга: ' + e.message);
  }
}

/**
 * Делает клик в нейтральной области экрана (например, пустые поля слева/справа).
 */
export async function simulateNeutralClick(page) {
  const viewport = page.viewportSize() || { width: 1280, height: 720 };
  // Клик в левой части экрана с отступами
  const x = Math.floor(Math.random() * 80) + 20;
  const y = Math.floor(Math.random() * (viewport.height - 200)) + 100;
  
  try {
    await simulateMouseMove(page, x, y);
    await page.mouse.down();
    await page.waitForTimeout(Math.floor(Math.random() * 60) + 40);
    await page.mouse.up();
  } catch (e) {
    logger.debug('Ошибка клика в пустую область: ' + e.message);
  }
}

/**
 * Запуск полной поведенческой симуляции (humanize).
 */
export async function humanizePage(page, options = {}) {
  if (!options.humanize) return;
  
  logger.info('Запуск симуляции человеческого поведения...');
  
  // 1. Двигаем мышь к центру страницы
  const viewport = page.viewportSize() || { width: 1280, height: 720 };
  const centerX = Math.floor(viewport.width / 2) + Math.floor(Math.random() * 100) - 50;
  const centerY = Math.floor(viewport.height / 2) + Math.floor(Math.random() * 100) - 50;
  await simulateMouseMove(page, centerX, centerY);
  
  // 2. Делаем нейтральный клик
  if (Math.random() < 0.6) {
    await simulateNeutralClick(page);
  }
  
  // 3. Выполняем скроллинг
  if (options.scroll !== false) {
    await simulateScrolling(page);
  }
  
  // 4. Ожидаем случайное время
  const delay = Math.floor(Math.random() * 1500) + 1000;
  logger.info(`Задержка чтения: ${delay} мс`);
  await page.waitForTimeout(delay);
}
