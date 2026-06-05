import { describe, it, expect, vi } from 'vitest';
import { processCanvasesOCR } from '../../src/canvas-extractor.js';

describe('Canvas Extractor OCR', () => {
  it('пропускает выполнение если options.ocr не установлен', async () => {
    const pageMock = {
      evaluate: vi.fn()
    };
    
    await processCanvasesOCR(pageMock, { ocr: false });
    
    expect(pageMock.evaluate).not.toHaveBeenCalled();
  });

  it('вызывает evaluate на странице для поиска canvas при options.ocr = true', async () => {
    const pageMock = {
      evaluate: vi.fn().mockResolvedValue([]),
      url: () => 'https://example.com'
    };
    
    await processCanvasesOCR(pageMock, { ocr: true });
    
    expect(pageMock.evaluate).toHaveBeenCalled();
  });
});
