import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TILE_ATTRIBUTIONS,
  bindRasterTileFallback,
  cartoBasemapKey,
  getMapRasterBasemap,
} from '@/lib/map-constants';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getMapRasterBasemap', () => {
  it('sem key → Esri Canvas (dark/light) e crédito Esri', () => {
    vi.stubEnv('NEXT_PUBLIC_CARTO_API_KEY', '');
    expect(cartoBasemapKey()).toBe('');
    const dark = getMapRasterBasemap(true);
    expect(dark.url).toContain('World_Dark_Gray_Base');
    expect(dark.url).not.toContain('cartocdn');
    expect(dark.attribution).toBe(TILE_ATTRIBUTIONS.esri);
    expect(dark.subdomains).toBeUndefined();

    const light = getMapRasterBasemap(false);
    expect(light.url).toContain('World_Light_Gray_Base');
    expect(light.attribution).toBe(TILE_ATTRIBUTIONS.esri);
  });

  it('com key → Carto dark/light com ?key= e crédito CARTO', () => {
    vi.stubEnv('NEXT_PUBLIC_CARTO_API_KEY', 'test-key');
    const dark = getMapRasterBasemap(true);
    expect(dark.url).toContain('basemaps.cartocdn.com/dark_all/');
    expect(dark.url).toContain('key=test-key');
    expect(dark.url).not.toContain('{r}');
    expect(dark.attribution).toBe(TILE_ATTRIBUTIONS.carto);
    expect(dark.subdomains).toBe('abcd');

    const light = getMapRasterBasemap(false);
    expect(light.url).toContain('light_all');
    expect(light.url).toContain('key=test-key');
    expect(light.url).not.toContain('{r}');
  });
});

describe('bindRasterTileFallback', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sem key não arma timeout', () => {
    vi.stubEnv('NEXT_PUBLIC_CARTO_API_KEY', '');
    const on = vi.fn();
    const stop = bindRasterTileFallback({ on }, () => {});
    expect(on).not.toHaveBeenCalled();
    stop();
  });

  it('Carto sem tileload → Esri', () => {
    vi.useFakeTimers();
    vi.stubEnv('NEXT_PUBLIC_CARTO_API_KEY', 'test-key');
    const handlers: Record<string, () => void> = {};
    const swap = vi.fn();
    bindRasterTileFallback(
      { on: (type, fn) => { handlers[type] = fn; } },
      swap,
    );
    vi.advanceTimersByTime(3499);
    expect(swap).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(swap).toHaveBeenCalledTimes(1);
  });

  it('primeiro tileload cancela o fallback', () => {
    vi.useFakeTimers();
    vi.stubEnv('NEXT_PUBLIC_CARTO_API_KEY', 'test-key');
    const handlers: Record<string, () => void> = {};
    const swap = vi.fn();
    bindRasterTileFallback(
      { on: (type, fn) => { handlers[type] = fn; } },
      swap,
    );
    handlers.tileload();
    vi.advanceTimersByTime(10_000);
    expect(swap).not.toHaveBeenCalled();
  });
});
