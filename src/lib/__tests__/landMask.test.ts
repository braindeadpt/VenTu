import { describe, expect, it } from 'vitest';
import { pointOnLand } from '../landMask';
import { landAwareFalloff } from '../mapHsField';

/**
 * Máscara de costa das camadas de campo (Hs/SST/vento/correntes).
 * Raster GADM ~600 m — cobre continente, Açores e Madeira. Antes deste
 * raster as ilhas não tinham máscara nenhuma e o campo pintava terra.
 */
describe('landMask.pointOnLand', () => {
  it('marca o interior do continente e das ilhas como terra', () => {
    // Continente
    expect(pointOnLand(37.14, -8.02)).toBe(true); // Loulé
    expect(pointOnLand(41.15, -8.66)).toBe(true); // Porto
    expect(pointOnLand(38.72, -9.14)).toBe(true); // Lisboa
    // Açores
    expect(pointOnLand(37.75, -25.65)).toBe(true); // interior de S. Miguel
    expect(pointOnLand(38.6, -28.65)).toBe(true); // Faial
    expect(pointOnLand(39.45, -31.2)).toBe(true); // Flores
    // Madeira
    expect(pointOnLand(32.72, -17.05)).toBe(true); // interior da Madeira
    // Espanha (faixa costeira E da caixa)
    expect(pointOnLand(37.2, -7.3)).toBe(true); // Ayamonte
  });

  it('marca mar aberto como mar', () => {
    expect(pointOnLand(36.93, -7.9)).toBe(false); // mar a sul da Ria Formosa
    expect(pointOnLand(36.9, -8.8)).toBe(false); // oceano a oeste de Sagres
    expect(pointOnLand(37.9, -25.0)).toBe(false); // mar a leste de S. Miguel
    expect(pointOnLand(32.4, -17.0)).toBe(false); // mar a sul da Madeira
  });

  it('fora do domínio do raster conta como mar', () => {
    expect(pointOnLand(50, 0)).toBe(false);
    expect(pointOnLand(37, -40)).toBe(false);
  });
});

describe('landAwareFalloff com máscara de terra', () => {
  const spot = { lat: 37.73, lon: -25.67 }; // Ponta Delgada, S. Miguel

  it('célula em terra nos Açores → 0 mesmo com costaFalloff cheia', () => {
    // 4 km para dentro do interior de S. Miguel
    const f = landAwareFalloff(37.75, -25.65, spot, 4, 13, 'azores');
    expect(f).toBe(0);
  });

  it('célula oceânica nos Açores mantém o falloff da banda', () => {
    const f = landAwareFalloff(37.9, -25.0, spot, 4, 13, 'azores');
    expect(f).toBeGreaterThan(0.5);
  });

  it('interior da Madeira → 0', () => {
    const f = landAwareFalloff(32.72, -17.05, { lat: 32.67, lon: -17.06 }, 5, 13, 'madeira');
    expect(f).toBe(0);
  });
});

describe('máscara de terra do domínio inteiro (land-mask.json)', () => {
  // Importado à parte: o estado do módulo (máscara instalada) não contamina
  // os testes do raster GADM acima.
  const load = async () => {
    const fs = await import('fs');
    const path = await import('path');
    const mod = await import('../landMask');
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../public/data/land-mask.json'), 'utf8'));
    return { mod, raw };
  };

  it('descodifica (transições por linha) e rejeita formas erradas', async () => {
    const { mod, raw } = await load();
    const m = mod.parseLandMask(raw)!;
    expect(m).not.toBeNull();
    expect(m.west).toBe(-34);
    expect(m.south).toBe(26.5);
    expect(m.cols * m.step).toBeCloseTo(33, 6);
    expect(m.rows * m.step).toBeCloseTo(20, 6);
    expect(mod.parseLandMask(null)).toBeNull();
    expect(mod.parseLandMask({ ...raw, v: 2 })).toBeNull();
    expect(mod.parseLandMask({ ...raw, runs: raw.runs.slice(0, 40) })).toBeNull();
    // compacto: < 40 KB cru
    expect(JSON.stringify(raw).length).toBeLessThan(40 * 1024);
  });

  it('cobre Espanha (Galiza, Cantábrico, Andaluzia), Marrocos, França e as ilhas', async () => {
    const { mod, raw } = await load();
    const m = mod.parseLandMask(raw)!;
    const land: Array<[number, number, string]> = [
      [42.88, -8.54, 'Santiago de Compostela'],
      [43.3, -8.3, 'interior da Corunha'],
      [43.45, -5.7, 'Astúrias'],
      [43.2, -2.9, 'Biscaia (Bilbau)'],
      [37.39, -5.98, 'Sevilha'],
      [33.6, -7.4, 'interior de Casablanca'],
      [30.4, -9.4, 'Agadir'],
      [44.5, -1.1, 'Landes (França)'],
      [28.27, -16.6, 'Tenerife'],
      [37.75, -25.65, 'S. Miguel'],
      [32.72, -17.05, 'Madeira'],
      [41.15, -8.6, 'Porto'],
      [38.72, -9.14, 'Lisboa'],
    ];
    for (const [lat, lon, name] of land) expect(mod.landMaskAt(m, lat, lon), name).toBe(true);
    const sea: Array<[number, number, string]> = [
      [43.6, -9.3, 'Costa da Morte'],
      [44.5, -4.0, 'golfo da Biscaia'],
      [43.6, -6.0, 'mar Cantábrico'],
      [36.6, -7.0, 'golfo de Cádis'],
      [35.95, -5.6, 'estreito de Gibraltar'],
      [33.0, -9.5, 'ao largo de Marrocos'],
      [36.93, -7.9, 'a sul da Ria Formosa'],
      [38.5, -9.6, 'ao largo do Cabo Espichel'],
      [37.9, -25.0, 'a leste de S. Miguel'],
      [40, -20, 'mar aberto'],
    ];
    for (const [lat, lon, name] of sea) expect(mod.landMaskAt(m, lat, lon), name).toBe(false);
    expect(mod.landMaskAt(m, 50, -10)).toBeNull();
  });

  it('pointOnLand usa a máscara instalada e cai no GADM fora do domínio dela', async () => {
    const { mod, raw } = await load();
    // antes: a Galiza norte (> 43 N) fica fora do raster GADM embutido
    mod.installLandMask(null);
    expect(mod.isLandMaskReady()).toBe(false);
    expect(mod.pointOnLand(43.3, -8.3)).toBe(false);
    let notified = 0;
    const off = mod.onLandMaskReady(() => {
      notified++;
    });
    mod.installLandMask(mod.parseLandMask(raw));
    off();
    expect(notified).toBe(1);
    expect(mod.isLandMaskReady()).toBe(true);
    expect(mod.pointOnLand(43.3, -8.3)).toBe(true);
    expect(mod.pointOnLand(33.6, -7.4)).toBe(true);
    expect(mod.pointOnLand(43.6, -9.3)).toBe(false);
    mod.installLandMask(null);
  });
});
