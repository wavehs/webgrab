import { describe, it, expect, vi } from 'vitest';
import { applyStealth } from '../../src/stealth.js';

describe('applyStealth', () => {
  it('вызывает addInitScript на объекте page', async () => {
    const pageMock = {
      addInitScript: vi.fn().mockResolvedValue(undefined)
    };
    
    const profile = {
      webgl: {
        vendor: 'Test Vendor',
        renderer: 'Test Renderer'
      },
      platform: 'Test Platform',
      languages: ['en'],
      hardwareConcurrency: 4
    };

    await applyStealth(pageMock, profile);
    
    expect(pageMock.addInitScript).toHaveBeenCalled();
  });
});
