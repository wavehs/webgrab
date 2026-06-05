import { describe, it, expect } from 'vitest';
import { detectPlatform, PLATFORM_RULES } from '../../src/content-detector.js';

describe('detectPlatform', () => {
  it('определяет платформу Feishu по URL feishu.cn', () => {
    const result = detectPlatform('https://nwjc3yozvqw.feishu.cn/wiki/xxx');
    expect(result).not.toBeNull();
    expect(result.key).toBe('feishu');
    expect(result.name).toBe('Feishu / Lark');
  });

  it('определяет платформу Feishu по URL larksuite.com', () => {
    const result = detectPlatform('https://docs.larksuite.com/wiki/page123');
    expect(result).not.toBeNull();
    expect(result.key).toBe('feishu');
  });

  it('определяет платформу Notion по URL notion.so', () => {
    const result = detectPlatform('https://www.notion.so/xxx');
    expect(result).not.toBeNull();
    expect(result.key).toBe('notion');
    expect(result.name).toBe('Notion');
  });

  it('определяет платформу Notion по URL notion.site', () => {
    const result = detectPlatform('https://my-workspace.notion.site/page-12345');
    expect(result).not.toBeNull();
    expect(result.key).toBe('notion');
  });

  it('определяет платформу Confluence по URL с confluence в домене', () => {
    const result = detectPlatform('https://confluence.example.com/wiki/xxx');
    expect(result).not.toBeNull();
    expect(result.key).toBe('confluence');
    expect(result.name).toBe('Confluence');
  });

  it('определяет платформу Confluence по URL atlassian.net/wiki', () => {
    const result = detectPlatform('https://mycompany.atlassian.net/wiki/spaces/PROJ/pages/123');
    expect(result).not.toBeNull();
    expect(result.key).toBe('confluence');
  });

  it('определяет платформу Yuque по URL yuque.com', () => {
    const result = detectPlatform('https://yuque.com/xxx');
    expect(result).not.toBeNull();
    expect(result.key).toBe('yuque');
    expect(result.name).toBe('Yuque (语雀)');
  });

  it('определяет платформу Google Docs по URL docs.google.com', () => {
    const result = detectPlatform('https://docs.google.com/document/d/xxx');
    expect(result).not.toBeNull();
    expect(result.key).toBe('googleDocs');
    expect(result.name).toBe('Google Docs');
  });

  it('возвращает null для обычного сайта', () => {
    const result = detectPlatform('https://example.com');
    expect(result).toBeNull();
  });

  it('возвращает null для medium.com', () => {
    const result = detectPlatform('https://medium.com/article');
    expect(result).toBeNull();
  });

  it('возвращает null для github.com', () => {
    const result = detectPlatform('https://github.com/user/repo');
    expect(result).toBeNull();
  });

  it('возвращает null для пустого URL', () => {
    const result = detectPlatform('');
    expect(result).toBeNull();
  });
});

describe('PLATFORM_RULES — структура правил', () => {
  const platformKeys = Object.keys(PLATFORM_RULES);

  it('содержит все 5 платформ', () => {
    expect(platformKeys).toContain('feishu');
    expect(platformKeys).toContain('notion');
    expect(platformKeys).toContain('confluence');
    expect(platformKeys).toContain('yuque');
    expect(platformKeys).toContain('googleDocs');
    expect(platformKeys).toHaveLength(5);
  });

  for (const [key, rules] of Object.entries(PLATFORM_RULES)) {
    describe(`платформа "${key}"`, () => {
      it('имеет имя (name)', () => {
        expect(rules.name).toBeDefined();
        expect(typeof rules.name).toBe('string');
        expect(rules.name.length).toBeGreaterThan(0);
      });

      it('имеет функцию match', () => {
        expect(typeof rules.match).toBe('function');
      });

      it('имеет массив contentSelectors (не пустой)', () => {
        expect(Array.isArray(rules.contentSelectors)).toBe(true);
        expect(rules.contentSelectors.length).toBeGreaterThan(0);
      });

      it('имеет массив removeSelectors', () => {
        expect(Array.isArray(rules.removeSelectors)).toBe(true);
        // Может быть пустым для некоторых платформ, но должен быть массивом
      });

      it('имеет массив expandSelectors', () => {
        expect(Array.isArray(rules.expandSelectors)).toBe(true);
      });

      it('имеет waitSelector (строку)', () => {
        expect(typeof rules.waitSelector).toBe('string');
      });

      it('имеет needsDeepScroll (boolean)', () => {
        expect(typeof rules.needsDeepScroll).toBe('boolean');
      });
    });
  }
});
