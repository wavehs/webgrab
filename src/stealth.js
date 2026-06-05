/**
 * Модуль stealth-инъекций для обхода систем обнаружения автоматизации (anti-bot).
 * Скрипты внедряются на уровне страницы до загрузки основного JS сайта.
 */
export async function applyStealth(page, profile = {}) {
  await page.addInitScript((prof) => {
    // Дефолтные значения из профиля
    const webglVendor = prof && prof.webgl ? prof.webgl.vendor : 'Google Inc. (Intel)';
    const webglRenderer = prof && prof.webgl ? prof.webgl.renderer : 'ANGLE (Intel, Intel(R) UHD Graphics (0x9BC4) Direct3D11 vs_5_0 ps_5_0, D3D11)';
    const platformVal = prof && prof.platform ? prof.platform : 'Win32';
    const languagesVal = prof && prof.languages ? prof.languages : ['ru-RU', 'ru', 'en-US', 'en'];
    const concurrencyVal = prof && prof.hardwareConcurrency ? prof.hardwareConcurrency : 8;

    // 1. Патчинг navigator.webdriver
    try {
      if (navigator.webdriver !== undefined) {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
          configurable: true
        });
      }
    } catch (e) {
      console.warn('Stealth: failed to patch navigator.webdriver', e);
    }

    // Восстанавливаем оригинальный getOwnPropertyDescriptor для webdriver
    try {
      const originalGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
      Object.getOwnPropertyDescriptor = function (target, prop) {
        if (target === navigator && prop === 'webdriver') {
          return {
            value: false,
            writable: false,
            enumerable: false,
            configurable: true
          };
        }
        return originalGetOwnPropertyDescriptor.apply(this, arguments);
      };
    } catch (e) {
      // Игнорируем
    }

    // 2. Plugin/MimeType spoofing (имитируем реальный браузер)
    try {
      const makeFauxPlugins = () => {
        const plugins = [
          { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }
        ];

        const mockPlugins = plugins.map(p => {
          const plugin = Object.create(Plugin.prototype);
          Object.defineProperties(plugin, {
            name: { get: () => p.name },
            filename: { get: () => p.filename },
            description: { get: () => p.description },
            length: { get: () => 0 }
          });
          return plugin;
        });

        const pluginArray = Object.create(PluginArray.prototype);
        Object.defineProperties(pluginArray, {
          length: { get: () => mockPlugins.length },
          item: { value: (index) => mockPlugins[index] },
          namedItem: { value: (name) => mockPlugins.find(p => p.name === name) || null }
        });

        for (let i = 0; i < mockPlugins.length; i++) {
          Object.defineProperty(pluginArray, i, { get: () => mockPlugins[i], enumerable: true });
        }

        return pluginArray;
      };

      Object.defineProperty(navigator, 'plugins', {
        get: () => makeFauxPlugins(),
        configurable: true
      });
    } catch (e) {
      // Игнорируем
    }

    // 3. WebGL fingerprint spoofing
    try {
      const getParameterProxy = (target, thisArg, argList) => {
        const param = argList[0];
        // UNMASKED_VENDOR_WEBGL = 37445
        if (param === 37445) {
          return webglVendor;
        }
        // UNMASKED_RENDERER_WEBGL = 37446
        if (param === 37446) {
          return webglRenderer;
        }
        return Reflect.apply(target, thisArg, argList);
      };

      const proxyHandler = {
        apply: getParameterProxy
      };

      if (window.WebGLRenderingContext) {
        WebGLRenderingContext.prototype.getParameter = new Proxy(
          WebGLRenderingContext.prototype.getParameter,
          proxyHandler
        );
      }
      if (window.WebGL2RenderingContext) {
        WebGL2RenderingContext.prototype.getParameter = new Proxy(
          WebGL2RenderingContext.prototype.getParameter,
          proxyHandler
        );
      }
    } catch (e) {
      // Игнорируем
    }

    // 4. Canvas fingerprint randomization (субпиксельный шум)
    try {
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (type, encoderOptions) {
        const context = this.getContext('2d');
        if (context) {
          try {
            const imgData = context.getImageData(0, 0, this.width || 1, this.height || 1);
            if (imgData.data.length >= 4) {
              imgData.data[2] = imgData.data[2] ^ 1;
              context.putImageData(imgData, 0, 0);
            }
          } catch (e) {
            // Игнорируем
          }
        }
        return originalToDataURL.apply(this, arguments);
      };

      const originalToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, type, encoderOptions) {
        const context = this.getContext('2d');
        if (context) {
          try {
            const imgData = context.getImageData(0, 0, this.width || 1, this.height || 1);
            if (imgData.data.length >= 4) {
              imgData.data[2] = imgData.data[2] ^ 1;
              context.putImageData(imgData, 0, 0);
            }
          } catch (e) {
            // Игнорируем
          }
        }
        return originalToBlob.apply(this, arguments);
      };
    } catch (e) {
      // Игнорируем
    }

    // 5. Chrome runtime emulation
    try {
      if (!window.chrome) {
        window.chrome = {};
      }
      
      if (!window.chrome.runtime) {
        window.chrome.runtime = {
          PlatformOs: {
            MAC: 'mac',
            WIN: 'win',
            ANDROID: 'android',
            CROS: 'cros',
            LINUX: 'linux',
            OPENBSD: 'openbsd'
          },
          PlatformArch: {
            ARM: 'arm',
            ARM64: 'arm64',
            X86_32: 'x86-32',
            X86_64: 'x86-64'
          },
          PlatformNaclArch: {
            ARM: 'arm',
            X86_32: 'x86-32',
            X86_64: 'x86-64'
          },
          RequestUpdateCheckStatus: {
            THROTTLED: 'throttled',
            NO_UPDATE: 'no_update',
            UPDATE_AVAILABLE: 'update_available'
          },
          OnInstalledReason: {
            INSTALL: 'install',
            UPDATE: 'update',
            CHROME_UPDATE: 'chrome_update',
            SHARED_MODULE_UPDATE: 'shared_module_update'
          },
          OnRestartRequiredReason: {
            APP_UPDATE: 'app_update',
            OS_UPDATE: 'os_update',
            PERIODIC: 'periodic'
          },
          connect: () => ({
            name: 'mock-port',
            disconnect: () => {},
            onDisconnect: { addListener: () => {} },
            onMessage: { addListener: () => {} },
            postMessage: () => {}
          }),
          sendMessage: () => {}
        };
      }

      if (!window.chrome.csi) {
        window.chrome.csi = function () {
          return {
            startE: Date.now() - 100,
            onloadT: Date.now(),
            pageT: 100,
            tran: 15
          };
        };
      }

      if (!window.chrome.loadTimes) {
        window.chrome.loadTimes = function () {
          return {
            requestTime: Date.now() / 1000 - 0.2,
            startLoadTime: Date.now() / 1000 - 0.2,
            commitLoadTime: Date.now() / 1000 - 0.1,
            finishDocumentLoadTime: Date.now() / 1000 - 0.05,
            finishLoadTime: Date.now() / 1000,
            firstPaintTime: Date.now() / 1000 - 0.08,
            firstPaintAfterLoadTime: 0,
            navigationType: 'Other',
            wasAlternativeServiceUsed: false,
            wasFetchedViaSpdy: false,
            wasNpnNegotiated: false,
            npnNegotiatedProtocol: '',
            connectionInfo: 'http/1.1'
          };
        };
      }
    } catch (e) {
      // Игнорируем
    }

    // 6. Permission API spoofing
    try {
      const originalQuery = Permissions.prototype.query;
      Permissions.prototype.query = function (queryObj) {
        if (queryObj && (queryObj.name === 'notifications' || queryObj.name === 'geolocation')) {
          return Promise.resolve({
            state: 'prompt',
            onchange: null
          });
        }
        return originalQuery.apply(this, arguments);
      };
    } catch (e) {
      // Игнорируем
    }

    // 7. Спуфинг языков, платформы и аппаратной параллельности
    try {
      Object.defineProperty(navigator, 'platform', {
        get: () => platformVal,
        configurable: true
      });

      Object.defineProperty(navigator, 'languages', {
        get: () => languagesVal,
        configurable: true
      });

      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => concurrencyVal,
        configurable: true
      });
    } catch (e) {
      // Игнорируем
    }
  }, profile);
}
