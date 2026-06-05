import { describe, it, expect, vi } from 'vitest';
import { setupFontInterception, deobfuscateText, getDecodedFontMap } from '../../src/font-decoder.js';

describe('Font Decoder', () => {
  it('настраивает обработчик событий ответа на странице', () => {
    const pageMock = {
      on: vi.fn()
    };
    
    setupFontInterception(pageMock);
    
    expect(pageMock.on).toHaveBeenCalledWith('response', expect.any(Function));
  });

  it('корректно декодирует текст по карте замен', () => {
    const map = {
      'a': 'x',
      'b': 'y',
      'c': 'z'
    };
    
    const text = 'abc def';
    const result = deobfuscateText(text, map);
    
    expect(result).toBe('xyz def');
  });

  it('возвращает исходный текст если карта замен пуста', () => {
    const text = 'hello';
    expect(deobfuscateText(text, null)).toBe('hello');
    expect(deobfuscateText(text, {})).toBe('hello');
  });

  it('возвращает пустую карту если на странице не было перехвачено шрифтов', async () => {
    const pageMock = {};
    const map = await getDecodedFontMap(pageMock);
    expect(map).toEqual({});
  });
});
