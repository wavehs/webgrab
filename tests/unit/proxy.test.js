import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { parseProxy, loadProxyList, ProxyRotator } from '../../src/proxy.js';

vi.mock('fs');

describe('parseProxy', () => {
  it('возвращает null для пустой строки', () => {
    expect(parseProxy('')).toBeNull();
    expect(parseProxy(null)).toBeNull();
  });

  it('распарсивает стандартный http прокси', () => {
    const result = parseProxy('http://127.0.0.1:8080');
    expect(result).toEqual({
      server: 'http://127.0.0.1:8080'
    });
  });

  it('автоматически добавляет http:// протокол если он отсутствует', () => {
    const result = parseProxy('127.0.0.1:8080');
    expect(result).toEqual({
      server: 'http://127.0.0.1:8080'
    });
  });

  it('распарсивает прокси с аутентификацией', () => {
    const result = parseProxy('socks5://user:pass@127.0.0.1:1080');
    expect(result).toEqual({
      server: 'socks5://127.0.0.1:1080',
      username: 'user',
      password: 'pass'
    });
  });
});

describe('ProxyRotator', () => {
  it('определяет наличие прокси', () => {
    const rotatorEmpty = new ProxyRotator();
    expect(rotatorEmpty.hasProxies()).toBe(false);

    const rotatorSingle = new ProxyRotator({ proxy: '127.0.0.1:8080' });
    expect(rotatorSingle.hasProxies()).toBe(true);
    expect(rotatorSingle.count()).toBe(1);
  });

  it('правильно осуществляет ротацию прокси по кругу', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('proxy1:8080\nproxy2:8080\nproxy3:8080');

    const rotator = new ProxyRotator({ proxyList: 'proxies.txt' });
    expect(rotator.count()).toBe(3);
    
    expect(rotator.getNextProxy()).toBe('proxy1:8080');
    expect(rotator.getNextProxy()).toBe('proxy2:8080');
    expect(rotator.getNextProxy()).toBe('proxy3:8080');
    expect(rotator.getNextProxy()).toBe('proxy1:8080'); // Возвращение к началу
  });
});
