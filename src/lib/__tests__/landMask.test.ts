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
