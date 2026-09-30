import { describe, expect, it } from 'vitest';
import {
  GIBS_BLANK_TILE_RATIO,
  GIBS_SATELLITE_URL,
  gibsBlankPixelRatio,
} from '@/lib/gibsSatellite';

function rgba(px: Array<[number, number, number]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(px.length * 4);
  px.forEach(([r, g, b], i) => {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  });
  return data;
}

describe('gibsSatellite', () => {
  it('URL aponta para o produto MODIS Terra true-color com slot default', () => {
    expect(GIBS_SATELLITE_URL).toContain('MODIS_Terra_CorrectedReflectance_TrueColor');
    expect(GIBS_SATELLITE_URL).toContain('/default/default/');
    expect(GIBS_SATELLITE_URL).toContain('{z}/{y}/{x}.jpg');
  });

  it('tile 100% preto (noite/sem dados) é classificado como vazio', () => {
    const px = Array.from({ length: 32 * 32 }, () => [0, 0, 0] as [number, number, number]);
    expect(gibsBlankPixelRatio(rgba(px), px.length)).toBe(1);
  });

  it('oceano real de dia (azul-escuro, max canal ~40) NÃO é vazio', () => {
    const px = Array.from({ length: 32 * 32 }, () => [8, 22, 42] as [number, number, number]);
    expect(gibsBlankPixelRatio(rgba(px), px.length)).toBe(0);
  });

  it('ruído JPEG de «preto» (1-3 por canal) continua vazio', () => {
    const px = Array.from({ length: 32 * 32 }, () => [2, 3, 1] as [number, number, number]);
    expect(gibsBlankPixelRatio(rgba(px), px.length)).toBe(1);
  });

  it('tile misto conta a fracção certa', () => {
    const half = (32 * 32) / 2;
    const px = [
      ...Array.from({ length: half }, () => [0, 0, 0] as [number, number, number]),
      ...Array.from({ length: half }, () => [30, 60, 90] as [number, number, number]),
    ];
    expect(gibsBlankPixelRatio(rgba(px), px.length)).toBeCloseTo(0.5, 5);
  });

  it('rácio de corte cobre tiles quase todos pretos mas não mistos', () => {
    const mostlyBlank = [
      ...Array.from({ length: Math.floor(32 * 32 * 0.95) }, () => [0, 0, 0] as [number, number, number]),
      ...Array.from({ length: 32 * 32 - Math.floor(32 * 32 * 0.95) }, () => [40, 80, 120] as [number, number, number]),
    ];
    expect(gibsBlankPixelRatio(rgba(mostlyBlank), mostlyBlank.length)).toBeGreaterThanOrEqual(GIBS_BLANK_TILE_RATIO);
  });

  it('pixelCount 0 não rebenta', () => {
    expect(gibsBlankPixelRatio(new Uint8ClampedArray(0), 0)).toBe(0);
  });
});
