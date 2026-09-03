import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TILE_ATTRIBUTIONS,
  bindRasterTileFallback,
  cartoBasemapKey,
  getMapRasterBasemap,
  watchTileLayer,
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

describe('watchTileLayer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function layer() {
    const handlers: Record<string, () => void> = {};
    return {
      handlers,
      fake: {
        on: (type: string, fn: () => void) => { handlers[type] = fn; },
        off: (type: string) => { delete handlers[type]; },
      },
    };
  }

  it('primeiro tileload emite ok e ignora tileerrors posteriores', () => {
    const { handlers, fake } = layer();
    const onState = vi.fn();
    const dispose = watchTileLayer(fake, onState);
    handlers.tileload();
    expect(onState).toHaveBeenLastCalledWith('ok');
    handlers.tileerror();
    expect(onState).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('tileerror sem nenhum tile carregado emite failed imediatamente', () => {
    const { handlers, fake } = layer();
    const onState = vi.fn();
    const dispose = watchTileLayer(fake, onState);
    handlers.tileerror();
    expect(onState).toHaveBeenLastCalledWith('failed');
    expect(onState).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('stall total (hangMs sem nenhum tile) emite failed no timeout', () => {
    vi.useFakeTimers();
    const { fake } = layer();
    const onState = vi.fn();
    const dispose = watchTileLayer(fake, onState, 8000);
    vi.advanceTimersByTime(7999);
    expect(onState).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onState).toHaveBeenLastCalledWith('failed');
    dispose();
  });

  it('ligação lenta mas viva: tileload dentro do hangMs cancela o failed', () => {
    vi.useFakeTimers();
    const { handlers, fake } = layer();
    const onState = vi.fn();
    const dispose = watchTileLayer(fake, onState, 8000);
    vi.advanceTimersByTime(6000); // ainda dentro da janela, sem resposta…
    handlers.tileload(); // …mas o tile chegou → ok, nunca failed
    expect(onState).toHaveBeenLastCalledWith('ok');
    expect(onState).not.toHaveBeenCalledWith('failed');
    vi.advanceTimersByTime(20_000);
    expect(onState).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('dispose silencia o timer e eventos posteriores', () => {
    vi.useFakeTimers();
    const { handlers, fake } = layer();
    const onState = vi.fn();
    const dispose = watchTileLayer(fake, onState, 8000);
    const tileerror = handlers.tileerror;
    dispose();
    vi.advanceTimersByTime(20_000);
    tileerror(); // evento que chega depois do dispose → ignorado
    expect(onState).not.toHaveBeenCalled();
  });
});
