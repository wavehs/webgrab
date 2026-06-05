import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { loadSession, saveSession, injectSessionStorage } from '../../src/session-manager.js';

vi.mock('fs');

describe('Session Manager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadSession', () => {
    it('возвращает null если файл не существует', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(loadSession('non-existent.json')).toBeNull();
    });

    it('корректно загружает и парсит существующую сессию', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const mockState = {
        cookies: [{ name: 'test', value: '123', domain: 'example.com' }],
        origins: [{ origin: 'https://example.com', localStorage: [] }],
        sessionStorage: { key: 'value' },
        savedAt: Date.now()
      };
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockState));

      const result = loadSession('session.json');
      expect(result).not.toBeNull();
      expect(result.storageState.cookies).toHaveLength(1);
      expect(result.sessionStorage).toEqual({ key: 'value' });
    });
  });

  describe('saveSession', () => {
    it('сохраняет сессию в файл', async () => {
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      
      const mockContext = {
        storageState: vi.fn().mockResolvedValue({
          cookies: [{ name: 'test', value: '123' }],
          origins: []
        })
      };

      const mockPage = {
        evaluate: vi.fn().mockResolvedValue({ key: 'val' })
      };

      await saveSession(mockContext, mockPage, 'session.json');

      expect(mockContext.storageState).toHaveBeenCalled();
      expect(mockPage.evaluate).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('injectSessionStorage', () => {
    it('вызывает addInitScript на объекте page', async () => {
      const pageMock = {
        addInitScript: vi.fn().mockResolvedValue(undefined)
      };

      await injectSessionStorage(pageMock, { key: 'val' });

      expect(pageMock.addInitScript).toHaveBeenCalled();
    });

    it('пропускает выполнение если данные отсутствуют', async () => {
      const pageMock = {
        addInitScript: vi.fn().mockResolvedValue(undefined)
      };

      await injectSessionStorage(pageMock, null);
      await injectSessionStorage(pageMock, {});

      expect(pageMock.addInitScript).not.toHaveBeenCalled();
    });
  });
});
