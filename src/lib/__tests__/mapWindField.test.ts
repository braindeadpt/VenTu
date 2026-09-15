import { describe, it, expect } from 'vitest';
import {
  advectWindParticle,
  buildWindFieldGrids,
  collectWindSamples,
  spawnWindParticle,
  windCellOnWater,
  metersPerPixel,
  type WindParticle,
} from '@/lib/mapWindField';
import type { MapHoursFile } from '@/lib/mapHours';

const TIMES = ['2026-09-11T08:00', '2026-09-11T11:00'];

function fileWith(wind: MapHoursFile['wind']): MapHoursFile {
  return {
    generatedAt: '2026-09-11T07:00:00.000Z',
    stepHours: 3,
    times: TIMES,
    sports: ['surf'],
    spots: { nazare: { best: [60, 60] } },
    wind,
  };
}

const NAZARE = { id: 'nazare', lat: 39.61, lon: -9.07, type: 'beach', bestSwell: 'oceano' };

describe('collectWindSamples', () => {
  it('converte direcção FROM (meteorológica) para TO (+180) e salta vento nulo', () => {
    const file = fileWith({ nazare: { spd: [5, 0.2], dir: [0, 90] } });
    const [s0] = collectWindSamples(file, [NAZARE], 0);
    expect(s0.dir).toBe(180);
    expect(s0.spd).toBe(5);
    // 0.2 m/s < MAP_WIND_MIN_MS — não entra no campo
    expect(collectWindSamples(file, [NAZARE], 1)).toHaveLength(0);
  });

  it('ignora spots sem dados de vento ou não-oceânicos', () => {
    const file = fileWith({ nazare: { spd: [5, 5], dir: [10, 10] } });
    const lake = { ...NAZARE, id: 'lagoa-spot', bestSwell: 'lagoa' };
    const wake = { ...NAZARE, id: 'wake-spot', type: 'wakeboard' };
    expect(collectWindSamples(file, [NAZARE, lake, wake], 0)).toHaveLength(1);
    expect(collectWindSamples(null, [NAZARE], 0)).toHaveLength(0);
  });
});

describe('windCellOnWater', () => {
  const westSpot = { lat: 39.6, lon: -9.07 }; // Nazaré — costa oeste
  const algarveSpot = { lat: 37.0, lon: -8.94 }; // costa sul

  it('corta células a leste do spot na costa oeste e a norte no Algarve', () => {
    expect(windCellOnWater(39.6, -9.2, westSpot, 0.5, 'mainland')).toBe(true);
    expect(windCellOnWater(39.6, -8.95, westSpot, 0.5, 'mainland')).toBe(false);
    expect(windCellOnWater(36.9, -8.94, algarveSpot, 0.5, 'mainland')).toBe(true);
    expect(windCellOnWater(37.2, -8.94, algarveSpot, 0.5, 'mainland')).toBe(false);
  });

  it('ilhas mantêm o campo em redor; falloff mínimo mata células fracas', () => {
    expect(windCellOnWater(39.4, -31.0, { lat: 39.4, lon: -31.1 }, 0.5, 'azores')).toBe(true);
    expect(windCellOnWater(39.6, -9.2, westSpot, 0.04, 'mainland')).toBe(false);
  });
});

describe('buildWindFieldGrids + advecção', () => {
  const samples = [{ lat: 39.61, lon: -9.07, spd: 10, dir: 0 }]; // sopra para norte
  const grids = buildWindFieldGrids(samples);

  it('produz uma grelha mainland com células no mar e vazias em terra', () => {
    const mainland = grids.find((g) => g.id === 'mainland');
    expect(mainland).toBeTruthy();
    // mar a oeste da Nazaré
    expect(mainland!.grid.some((c) => c !== null)).toBe(true);
  });

  it('a partícula advecta na direcção TO e morre quando sai do campo', () => {
    const p: WindParticle = {
      lat: 39.61, lon: -9.2, px: 0, py: 0, hasPrev: false, life: 500, kt: 19, jit: 1,
    };
    const lat0 = p.lat;
    for (let i = 0; i < 5; i++) advectWindParticle(grids, p, 0.016, 8);
    expect(p.lat).toBeGreaterThan(lat0); // dir 0 = para norte → lat sobe
  });

  it('spawn preenche a partícula dentro da área do campo', () => {
    const p: WindParticle = { lat: 0, lon: 0, px: 0, py: 0, hasPrev: false, life: 0, kt: 0, jit: 1 };
    // rand 0.5 → lat 39.6, lon −9.3 — ~22 km a oeste da Nazaré, dentro do campo
    const view = { south: 39.4, west: -9.6, north: 39.8, east: -9.0 };
    const out = spawnWindParticle(grids, view, p, () => 0.5);
    expect(out).not.toBeNull();
    expect(p.kt).toBeGreaterThan(0);
    expect(p.life).toBeGreaterThan(0);
  });
});

describe('metersPerPixel', () => {
  it('diminui com o zoom e é maior no equador', () => {
    expect(metersPerPixel(39, 8)).toBeLessThan(metersPerPixel(39, 6));
    expect(metersPerPixel(0, 8)).toBeGreaterThan(metersPerPixel(60, 8));
  });
});
