import { logger } from './utils.js';

/**
 * Определяет наличие капчи на странице и собирает ее параметры.
 * 
 * @param {import('playwright').Page} page 
 * @returns {Promise<object|null>}
 */
export async function detectCaptcha(page) {
  try {
    return await page.evaluate(() => {
      // 1. Проверка reCAPTCHA
      const recaptchaIframe = document.querySelector('iframe[src*="google.com/recaptcha"]');
      if (recaptchaIframe) {
        const src = recaptchaIframe.getAttribute('src');
        const url = new URL(src);
        const sitekey = url.searchParams.get('k');
        if (sitekey) return { type: 'recaptcha', sitekey, url: window.location.href };
      }
      
      const recaptchaContainer = document.querySelector('.g-recaptcha');
      if (recaptchaContainer && recaptchaContainer.getAttribute('data-sitekey')) {
        return { type: 'recaptcha', sitekey: recaptchaContainer.getAttribute('data-sitekey'), url: window.location.href };
      }

      // 2. Проверка hCaptcha
      const hcaptchaIframe = document.querySelector('iframe[src*="hcaptcha.com"]');
      if (hcaptchaIframe) {
        const src = hcaptchaIframe.getAttribute('src');
        const url = new URL(src);
        const sitekey = url.searchParams.get('sitekey');
        if (sitekey) return { type: 'hcaptcha', sitekey, url: window.location.href };
      }

      const hcaptchaContainer = document.querySelector('.h-captcha');
      if (hcaptchaContainer && hcaptchaContainer.getAttribute('data-sitekey')) {
        return { type: 'hcaptcha', sitekey: hcaptchaContainer.getAttribute('data-sitekey'), url: window.location.href };
      }

      // 3. Проверка Cloudflare Turnstile
      const turnstileIframe = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
      if (turnstileIframe) {
        const src = turnstileIframe.getAttribute('src');
        const url = new URL(src);
        const sitekey = url.searchParams.get('sitekey');
        if (sitekey) return { type: 'turnstile', sitekey, url: window.location.href };
      }

      const turnstileContainer = document.querySelector('.cf-turnstile');
      if (turnstileContainer && turnstileContainer.getAttribute('data-sitekey')) {
        return { type: 'turnstile', sitekey: turnstileContainer.getAttribute('data-sitekey'), url: window.location.href };
      }

      return null;
    });
  } catch (err) {
    logger.debug('Ошибка при детектировании капчи: ' + err.message);
    return null;
  }
}

/**
 * Отправляет капчу в сервис решения и дожидается ответа.
 */
export async function solveCaptcha(captchaInfo, serviceName, apiKey) {
  const service = serviceName.toLowerCase();
  
  if (service === '2captcha') {
    return await solve2Captcha(captchaInfo, apiKey);
  } else if (service === 'capsolver') {
    return await solveCapSolver(captchaInfo, apiKey);
  } else if (service === 'anticaptcha' || service === 'anti-captcha') {
    return await solveAntiCaptcha(captchaInfo, apiKey);
  } else {
    throw new Error(`Неподдерживаемый сервис капчи: ${serviceName}`);
  }
}

async function solve2Captcha(info, apiKey) {
  logger.info(`Отправка капчи в 2Captcha (${info.type})...`);
  
  let method = 'userrecaptcha';
  if (info.type === 'hcaptcha') method = 'hcaptcha';
  if (info.type === 'turnstile') method = 'turnstile';

  // Шаг 1: Создание задачи
  const params = new URLSearchParams({
    key: apiKey,
    method: method,
    googlekey: info.sitekey,
    pageurl: info.url,
    json: '1'
  });

  const response = await fetch('https://2captcha.com/in.php', {
    method: 'POST',
    body: params
  });
  const data = await response.json();

  if (data.status !== 1) {
    throw new Error(`Ошибка 2Captcha (отправка): ${data.request}`);
  }

  const taskId = data.request;
  return await pollResult(`https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`);
}

async function solveCapSolver(info, apiKey) {
  logger.info(`Отправка капчи в CapSolver (${info.type})...`);

  let taskType = 'ReCaptchaV2TaskProxyless';
  if (info.type === 'hcaptcha') taskType = 'HCaptchaTaskProxyless';
  if (info.type === 'turnstile') taskType = 'AntiTurnstileTaskProxyLess';

  // Шаг 1: Создание задачи
  const response = await fetch('https://api.capsolver.com/createTask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientKey: apiKey,
      task: {
        type: taskType,
        websiteURL: info.url,
        websiteKey: info.sitekey
      }
    })
  });
  const data = await response.json();

  if (data.errorId !== 0) {
    throw new Error(`Ошибка CapSolver (отправка): ${data.errorDescription}`);
  }

  const taskId = data.taskId;

  // Шаг 2: Опрос статуса
  const pollUrl = 'https://api.capsolver.com/getTaskResult';
  while (true) {
    await new Promise(r => setTimeout(r, 3000));
    const statusResponse = await fetch(pollUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: apiKey, taskId })
    });
    const statusData = await statusResponse.json();

    if (statusData.errorId !== 0) {
      throw new Error(`Ошибка CapSolver (опрос): ${statusData.errorDescription}`);
    }

    if (statusData.status === 'ready') {
      return statusData.solution.gRecaptchaResponse || statusData.solution.token;
    }
    
    logger.info('CapSolver решает капчу...');
  }
}

async function solveAntiCaptcha(info, apiKey) {
  logger.info(`Отправка капчи в Anti-Captcha (${info.type})...`);

  let taskType = 'NoCaptchaTaskProxyless';
  if (info.type === 'hcaptcha') taskType = 'HCaptchaTaskProxyless';
  if (info.type === 'turnstile') taskType = 'TurnstileTaskProxyless';

  // Шаг 1: Создание задачи
  const response = await fetch('https://api.anti-captcha.com/createTask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientKey: apiKey,
      task: {
        type: taskType,
        websiteURL: info.url,
        websiteKey: info.sitekey
      }
    })
  });
  const data = await response.json();

  if (data.errorId !== 0) {
    throw new Error(`Ошибка Anti-Captcha (отправка): ${data.errorDescription}`);
  }

  const taskId = data.taskId;

  // Шаг 2: Опрос статуса
  const pollUrl = 'https://api.anti-captcha.com/getTaskResult';
  while (true) {
    await new Promise(r => setTimeout(r, 3000));
    const statusResponse = await fetch(pollUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: apiKey, taskId })
    });
    const statusData = await statusResponse.json();

    if (statusData.errorId !== 0) {
      throw new Error(`Ошибка Anti-Captcha (опрос): ${statusData.errorDescription}`);
    }

    if (statusData.status === 'ready') {
      return statusData.solution.gRecaptchaResponse || statusData.solution.token;
    }
    
    logger.info('Anti-Captcha решает капчу...');
  }
}

async function pollResult(url) {
  while (true) {
    await new Promise(r => setTimeout(r, 3000));
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 1) {
      return data.request;
    }
    
    if (data.request !== 'CAPCHA_NOT_READY') {
      throw new Error(`Ошибка при решении капчи: ${data.request}`);
    }
    
    logger.info('Капча решается сервис-провайдером...');
  }
}

/**
 * Инжектирует токен решения в форму и запускает callback-функции.
 */
export async function injectCaptchaToken(page, type, token) {
  await page.evaluate(({ captchaType, tokenVal }) => {
    let selector = '';
    let callbackAttr = '';
    
    if (captchaType === 'recaptcha') {
      selector = '[name="g-recaptcha-response"]';
      callbackAttr = 'data-callback';
    } else if (captchaType === 'hcaptcha') {
      selector = '[name="h-captcha-response"]';
      callbackAttr = 'data-callback';
    } else if (captchaType === 'turnstile') {
      selector = '[name="cf-turnstile-response"]';
      callbackAttr = 'data-callback';
    }

    const inputs = document.querySelectorAll(selector);
    inputs.forEach(input => {
      input.value = tokenVal;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const captchaContainer = document.querySelector(`.g-recaptcha, .h-captcha, .cf-turnstile`);
    if (captchaContainer) {
      const callbackName = captchaContainer.getAttribute(callbackAttr);
      if (callbackName && typeof window[callbackName] === 'function') {
        window[callbackName](tokenVal);
      }
    }
  }, { captchaType: type, tokenVal: token });
}

/**
 * Детектирует, решает и применяет капчу на странице при указании ключей.
 */
export async function trySolveCaptchaPage(page, options = {}) {
  if (!options.captchaService || !options.captchaKey) return;

  const captchaInfo = await detectCaptcha(page);
  if (!captchaInfo) return;

  logger.info(`На странице обнаружена капча: ${captchaInfo.type}`);
  
  try {
    const token = await solveCaptcha(captchaInfo, options.captchaService, options.captchaKey);
    logger.success('Капча успешно решена!');
    
    await injectCaptchaToken(page, captchaInfo.type, token);
    
    // Даем странице время для обновления
    await page.waitForTimeout(3000);
  } catch (err) {
    logger.error(`Не удалось решить капчу: ${err.message}`);
  }
}
