import { describe, expect, it } from 'vitest';
import {
  GIBS_SATELLITE_URL,
  gibsBlankPixelRatio,
  gibsMaskPixels,
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

  it('pixelCount 0 não rebenta', () => {
    expect(gibsBlankPixelRatio(new Uint8ClampedArray(0), 0)).toBe(0);
  });
});

describe('gibsMaskPixels', () => {
  it('pixels pretos ficam transparentes, pixels com conteúdo ficam opacos', () => {
    const data = rgba([
      [0, 0, 0],
      [30, 60, 90],
      [1, 2, 3],
      [255, 200, 100],
    ]);
    const content = gibsMaskPixels(data);
    expect(content).toBe(2);
    expect(data[3]).toBe(0); // preto → alpha 0
    expect(data[7]).toBe(255); // oceano → intacto
    expect(data[11]).toBe(0); // ruído preto → alpha 0
    expect(data[15]).toBe(255); // nuvem → intacto
  });

  it('tile todo com conteúdo não perde alpha nenhum', () => {
    const data = rgba([
      [50, 80, 110],
      [200, 200, 190],
    ]);
    expect(gibsMaskPixels(data)).toBe(2);
    expect(data[3]).toBe(255);
    expect(data[7]).toBe(255);
  });

  it('tile todo preto devolve 0 conteúdo', () => {
    const data = rgba([
      [0, 0, 0],
      [4, 5, 6],
    ]);
    expect(gibsMaskPixels(data)).toBe(0);
  });
});
