import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Spot } from '@/types';
import {
  buildMapHoursFile,
  indexForHourOfDay,
  mapHoursClock,
  parseHourOfDayParam,
  pickMapHourTimes,
  scoreAtHour,
  hsAtHour,
  currentAtHour,
  fetchMapHours,
  clearMapHoursCache,
} from '@/lib/mapHours';

function spot(id: string): Spot {
  return {
    id,
    slug: id,
    name: id,
    nameEn: id,
    region: 'Test',
    regionEn: 'Test',
    lat: 41,
    lon: -8.9,
    coastOrientation: 270,
    type: 'surf',
    difficulty: 'intermediate',
    bestWind: 'N',
    bestSwell: 'W',
    description: '',
    descriptionEn: '',
    facilities: [],
    hazards: [],
    compatibleSports: ['surf'],
  };
}

function hour(time: string, waveHeight: number, tideHeight?: number): Record<string, unknown> {
  return {
    time,
    waveHeight,
    wavePeriod: 12,
    waveDirection: 270,
    windSpeed: 2,
    windDirection: 90,
    windGust: 3,
    waterTemp: 18,
    ...(tideHeight !== undefined ? { tideHeight } : {}),
  };
}

describe('mapHours', () => {
  const times = Array.from({ length: 72 }, (_, i) => {
    const day = String(3 + Math.floor(i / 24)).padStart(2, '0');
    const hh = String(i % 24).padStart(2, '0');
    return `2026-09-${day}T${hh}:00`;
  });

  // 08:00 Lisbon = 07:00 UTC during WEST (Sep).
  const now = new Date('2026-09-03T07:00:00.000Z');

  it('picks 16 steps of 3h from now', () => {
    const picked = pickMapHourTimes(times, now);
    expect(picked).toHaveLength(16);
    expect(picked[0]).toBe('2026-09-03T08:00');
    expect(picked[1]).toBe('2026-09-03T11:00');
    expect(picked[3]).toBe('2026-09-03T17:00');
  });

  it('clock is the Lisbon hour', () => {
    expect(mapHoursClock('2026-09-03T18:00')).toBe('18h');
  });

  it('indexForHourOfDay finds the 17h step', () => {
    const picked = pickMapHourTimes(times, now);
    expect(mapHoursClock(picked[indexForHourOfDay(picked, 17)])).toBe('17h');
  });

  it('parseHourOfDayParam accepts 0–23', () => {
    expect(parseHourOfDayParam('18')).toBe(18);
    expect(parseHourOfDayParam('0')).toBe(0);
    expect(parseHourOfDayParam('24')).toBeNull();
    expect(parseHourOfDayParam('')).toBeNull();
    expect(parseHourOfDayParam(null)).toBeNull();
  });

  it('builds scores that change from morning to afternoon', () => {
    const nazare = spot('nazare');
    const file = buildMapHoursFile({
      now,
      generatedAt: '2026-09-03T07:00:00.000Z',
      spots: [nazare],
      conditions: {},
      forecasts: {
        nazare: times.map((t) => hour(t, t.endsWith('T08:00') ? 0.4 : 2.4)),
      },
    });
    expect(file.times).toHaveLength(16);
    const morning = scoreAtHour(file, 'nazare', 'surf', 0);
    const afternoon = scoreAtHour(file, 'nazare', 'surf', indexForHourOfDay(file.times, 17));
    expect(morning).toBeDefined();
    expect(afternoon).toBeDefined();
    expect(afternoon).toBeGreaterThan(morning!);
    expect(hsAtHour(file, 'nazare', 0)).toBe(0.4);
    expect(hsAtHour(file, 'nazare', indexForHourOfDay(file.times, 17))).toBe(2.4);
    expect(file.currents).toBeUndefined();
    expect(scoreAtHour(file, 'nazare', 'all', 3)!).toBeGreaterThanOrEqual(
      scoreAtHour(file, 'nazare', 'surf', 3)!,
    );
  });

  it('emits hourly Lisboa tide from the Cascais spot with the most samples', () => {
    const guincho = spot('guincho');
    guincho.region = 'Cascais';
    const file = buildMapHoursFile({
      now,
      generatedAt: '2026-09-03T07:00:00.000Z',
      spots: [guincho],
      conditions: {},
      forecasts: {
        guincho: times.map((t, i) => hour(t, 1.2, Math.sin((i / 12) * Math.PI))),
      },
    });
    expect(file.times).toHaveLength(16);
    expect(file.tides?.Lisboa).toBeDefined();
    expect(file.tides!.Lisboa.spotId).toBe('guincho');
    expect(file.tides!.Lisboa.times).toHaveLength(48);
    expect(file.tides!.Lisboa.height).toHaveLength(48);
    expect(file.tides!.Lisboa.times[0]).toBe('2026-09-03T08:00');
  });

  it('bakes surface currents when the forecast has them', () => {
    const nazare = spot('nazare');
    const file = buildMapHoursFile({
      now,
      generatedAt: '2026-09-03T07:00:00.000Z',
      spots: [nazare],
      conditions: {},
      forecasts: {
        nazare: times.map((t) => ({
          ...hour(t, 1.2),
          currentSpeed: t.endsWith('T08:00') ? 0.08 : 0.27,
          currentDir: t.endsWith('T08:00') ? 350 : 10,
        })),
      },
    });
    expect(currentAtHour(file, 'nazare', 0)).toEqual({ spd: 0.08, dir: 350 });
    expect(currentAtHour(file, 'nazare', indexForHourOfDay(file.times, 17))?.spd).toBe(0.27);
  });
});

describe('fetchMapHours', () => {
  afterEach(() => {
    clearMapHoursCache();
    vi.unstubAllGlobals();
  });

  const validFile = {
    generatedAt: '2026-09-03T07:00:00.000Z',
    stepHours: 3,
    times: ['2026-09-03T08:00', '2026-09-03T11:00'],
    sports: ['surf'],
    spots: { nazare: { surf: [40, 70], best: [40, 70] } },
  };

  it('caches a successful fetch for the session', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(validFile), { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    const a = await fetchMapHours();
    const b = await fetchMapHours();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(a?.times).toHaveLength(2);
    expect(b).toBe(a);
  });

  it('caches a 404 as null (no retry storm on Pages)', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetchImpl);
    expect(await fetchMapHours()).toBeNull();
    expect(await fetchMapHours()).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('shares an in-flight request', async () => {
    let resolve!: (v: Response) => void;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    vi.stubGlobal('fetch', fetchImpl);
    const a = fetchMapHours();
    const b = fetchMapHours();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    resolve(new Response(JSON.stringify(validFile), { status: 200 }));
    expect((await a)?.times).toEqual((await b)?.times);
  });
});
