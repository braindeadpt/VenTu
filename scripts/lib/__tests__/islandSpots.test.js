import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  ISLAND_BUOY_MAP_KM,
  ISLAND_BUOY_ATTACH_KM,
  isIslandSpot,
  buoyMapKmFor,
  buoyAttachKmForMapping,
} = require('../islandSpots.js');

describe('islandSpots — isIslandSpot (geo-box, sem depender de region)', () => {
  it('detecta Açores e Madeira', () => {
    expect(isIslandSpot({ lat: 37.89, lon: -25.82 })).toBe(true); // S. Miguel
    expect(isIslandSpot({ lat: 36.95, lon: -25.09 })).toBe(true); // Santa Maria
    expect(isIslandSpot({ lat: 39.46, lon: -31.13 })).toBe(true); // Flores
    expect(isIslandSpot({ lat: 32.65, lon: -16.92 })).toBe(true); // Funchal
    expect(isIslandSpot({ lat: 33.06, lon: -16.33 })).toBe(true); // Porto Santo
  });

  it('rejeita continente, Galiza, Cádiz e valores inválidos', () => {
    expect(isIslandSpot({ lat: 41.85, lon: -8.87 })).toBe(false); // Moledo
    expect(isIslandSpot({ lat: 38.72, lon: -9.42 })).toBe(false); // Cabo da Roca
    expect(isIslandSpot({ lat: 42.12, lon: -9.43 })).toBe(false); // Cabo Silleiro
    expect(isIslandSpot({ lat: 36.49, lon: -6.96 })).toBe(false); // Golfo de Cádiz
    expect(isIslandSpot({ lat: 36.0, lon: -5.6 })).toBe(false);   // Estreito
    expect(isIslandSpot({})).toBe(false);
    expect(isIslandSpot(null)).toBe(false);
    expect(isIslandSpot({ lat: 'x', lon: -25 })).toBe(false);
  });
});

describe('islandSpots — caps por contexto', () => {
  it('map radius: ilha 280, fallback para o resto', () => {
    expect(ISLAND_BUOY_MAP_KM).toBe(280);
    expect(ISLAND_BUOY_ATTACH_KM).toBe(280);
    expect(buoyMapKmFor({ lat: 37.89, lon: -25.82 }, 250)).toBe(280);
    expect(buoyMapKmFor({ lat: 41.85, lon: -8.87 }, 250)).toBe(250);
  });

  it('attach via flag do mapping (o merge não precisa do spot)', () => {
    expect(buoyAttachKmForMapping({ island: true, distanceKm: 249 }, 200)).toBe(280);
    expect(buoyAttachKmForMapping({ distanceKm: 249 }, 200)).toBe(200);
    expect(buoyAttachKmForMapping(null, 200)).toBe(200);
  });
});
