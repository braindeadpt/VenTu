import { describe, expect, it } from 'vitest';
import {
  MAP_AREA_BOUNDS,
  MAP_HEAVY_RASTER_KEYS,
  MAP_HEAVY_RASTER_MAX,
  isMapAreaKey,
  planHeavyRasterEnable,
} from '../mapLayerBus';

describe('planHeavyRasterEnable (§8 — máx. 2 raster pesadas)', () => {
  it('abaixo do limite: acrescenta sem evicção', () => {
    const r = planHeavyRasterEnable(['radar'], 'nauticalChart');
    expect(r.evict).toBeUndefined();
    expect(r.order).toEqual(['radar', 'nauticalChart']);
  });

  it('na 3.ª: desliga a mais antiga e roda a ordem', () => {
    const r = planHeavyRasterEnable(['nauticalChart', 'goesIr'], 'radar');
    expect(r.evict).toBe('nauticalChart');
    expect(r.order).toEqual(['goesIr', 'radar']);
  });

  it('re-activar uma já ligada passa-a para o fim (fica «mais recente»)', () => {
    const r = planHeavyRasterEnable(['nauticalChart', 'radar'], 'nauticalChart');
    expect(r.evict).toBeUndefined();
    expect(r.order).toEqual(['radar', 'nauticalChart']);
  });

  it('constantes: 3 pesadas conhecidas, máximo 2', () => {
    expect(MAP_HEAVY_RASTER_KEYS).toEqual(['radar', 'nauticalChart', 'goesIr']);
    expect(MAP_HEAVY_RASTER_MAX).toBe(2);
  });
});

describe('MAP_AREA_BOUNDS (§10 — chips de ilha)', () => {
  it('continente cobre a costa portuguesa completa', () => {
    const c = MAP_AREA_BOUNDS.continent;
    expect(c.south).toBeLessThanOrEqual(36.9); // Sagres
    expect(c.north).toBeGreaterThanOrEqual(42.1); // Minho
    expect(c.west).toBeLessThanOrEqual(-9.5); // Cabo da Roca
    expect(c.east).toBeGreaterThanOrEqual(-7.4); // raia
  });

  it('Açores e Madeira cobrem os arquipélagos', () => {
    expect(MAP_AREA_BOUNDS.azores.west).toBeLessThanOrEqual(-31);
    expect(MAP_AREA_BOUNDS.azores.east).toBeGreaterThanOrEqual(-25);
    expect(MAP_AREA_BOUNDS.madeira.west).toBeLessThanOrEqual(-17.3);
    expect(MAP_AREA_BOUNDS.madeira.east).toBeGreaterThanOrEqual(-16.3);
  });

  it('isMapAreaKey valida o payload do evento', () => {
    expect(isMapAreaKey('continent')).toBe(true);
    expect(isMapAreaKey('azores')).toBe(true);
    expect(isMapAreaKey('madeira')).toBe(true);
    expect(isMapAreaKey('porto')).toBe(false);
    expect(isMapAreaKey(undefined)).toBe(false);
    expect(isMapAreaKey({})).toBe(false);
  });
});
