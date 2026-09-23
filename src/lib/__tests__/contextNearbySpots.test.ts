import { describe, it, expect } from 'vitest';
import {
  pickMapHourStep,
  nearestSpots,
  nearbySpotScore,
} from '@/lib/context/nearbySpots';
import type { MapHoursFile } from '@/lib/mapHours';
import type { Spot } from '@/types';

// Passos de 3 h no formato do map-hours.json (ISO local, sem Z).
const TIMES = [
  '2026-09-21T23:00',
  '2026-09-22T02:00',
  '2026-09-22T05:00',
  '2026-09-22T08:00',
];

describe('pickMapHourStep', () => {
  it('ficheiro vazio → -1', () => {
    expect(pickMapHourStep([], '2026-09-22T06:00')).toBe(-1);
  });

  it('sem hora escolhida → primeiro passo', () => {
    expect(pickMapHourStep(TIMES, undefined)).toBe(0);
    expect(pickMapHourStep(TIMES, null)).toBe(0);
  });

  it('hora exacta num passo → esse passo', () => {
    expect(pickMapHourStep(TIMES, '2026-09-22T05:00')).toBe(2);
  });

  it('hora a meio do intervalo → passo que a contém (floor)', () => {
    expect(pickMapHourStep(TIMES, '2026-09-22T06:30')).toBe(2);
    expect(pickMapHourStep(TIMES, '2026-09-22T07:59')).toBe(2);
  });

  it('hora antes do primeiro passo → primeiro (clamp)', () => {
    expect(pickMapHourStep(TIMES, '2026-09-21T10:00')).toBe(0);
  });

  it('hora depois do último passo → último (clamp)', () => {
    expect(pickMapHourStep(TIMES, '2026-09-25T12:00')).toBe(3);
  });
});

function fakeSpot(id: string, lat: number, lon: number, sports?: Spot['compatibleSports']): Spot {
  return {
    id,
    slug: id,
    name: id,
    nameEn: id,
    region: 'x',
    regionEn: 'x',
    lat,
    lon,
    type: 'surf',
    difficulty: 'all',
    bestWind: '',
    bestSwell: '',
    description: '',
    descriptionEn: '',
    facilities: [],
    hazards: [],
    compatibleSports: sports,
    coastOrientation: 0,
  };
}

describe('nearestSpots', () => {
  const current = fakeSpot('me', 38.7, -9.4);
  const all = [
    current,
    fakeSpot('near', 38.71, -9.41),
    fakeSpot('mid', 38.9, -9.4),
    fakeSpot('far', 41.0, -9.0),
  ];

  it('exclui o próprio e ordena por distância', () => {
    const out = nearestSpots(current, all, { maxKm: 500 });
    expect(out.map((e) => e.spot.id)).toEqual(['near', 'mid', 'far']);
    expect(out[0].distanceKm).toBeLessThan(out[1].distanceKm);
  });

  it('respeita limit e maxKm', () => {
    expect(nearestSpots(current, all, { limit: 1, maxKm: 500 })).toHaveLength(1);
    expect(nearestSpots(current, all, { maxKm: 50 })).toHaveLength(2);
  });
});

describe('nearbySpotScore', () => {
  const file = {
    generatedAt: 'x',
    stepHours: 3,
    times: TIMES,
    sports: ['surf', 'sup'],
    spots: {
      near: { surf: [10, 20, 30, 40], sup: [5, 5, 5, 5] },
    },
  } as unknown as MapHoursFile;

  it('devolve o score da modalidade no passo escolhido', () => {
    const entry = { spot: fakeSpot('near', 0, 0, ['surf', 'sup']), distanceKm: 1 };
    expect(nearbySpotScore(file, entry, 'surf', 2)).toBe(30);
  });

  it('modalidade não praticada no vizinho → null («—»)', () => {
    const entry = { spot: fakeSpot('near', 0, 0, ['sup']), distanceKm: 1 };
    expect(nearbySpotScore(file, entry, 'surf', 2)).toBeNull();
  });

  it('sem série no ficheiro → null', () => {
    const entry = { spot: fakeSpot('ghost', 0, 0, ['surf']), distanceKm: 1 };
    expect(nearbySpotScore(file, entry, 'surf', 2)).toBeNull();
  });

  it('compatibleSports indefinido → decide pelo ficheiro', () => {
    const entry = { spot: fakeSpot('near', 0, 0, undefined), distanceKm: 1 };
    expect(nearbySpotScore(file, entry, 'sup', 0)).toBe(5);
  });
});
