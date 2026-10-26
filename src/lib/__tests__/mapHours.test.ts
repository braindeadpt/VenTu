import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Spot } from '@/types';
import { buildMapHoursFile } from '@/lib/mapHoursBuild';
import {
  indexForHourOfDay,
  mapHoursClock,
  parseHourOfDayParam,
  pickMapHourTimes,
  scoreAtHour,
  hsAtHour,
  sstAtHour,
  thermalAtHour,
  currentAtHour,
  fetchMapHours,
  clearMapHoursCache,
  type MapHoursFile,
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
    expect(sstAtHour(file, 'nazare', 0)).toBe(18);
    expect(file.thermal).toBeUndefined();
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

  it('bakes SST and sea-breeze thermal when airTemp + ΔT are present', () => {
    const nazare = spot('nazare');
    nazare.coastOrientation = 270;
    const file = buildMapHoursFile({
      now,
      generatedAt: '2026-09-03T07:00:00.000Z',
      spots: [nazare],
      conditions: {},
      forecasts: {
        nazare: times.map((t) => ({
          ...hour(t, 1.2),
          waterTemp: t.endsWith('T08:00') ? 14 : 18,
          airTemp: t.endsWith('T17:00') ? 28 : 16,
          windSpeed: t.endsWith('T17:00') ? 8 : 2,
          windDirection: t.endsWith('T17:00') ? 270 : 90,
        })),
      },
    });
    expect(sstAtHour(file, 'nazare', 0)).toBe(14);
    expect(sstAtHour(file, 'nazare', indexForHourOfDay(file.times, 17))).toBe(18);
    expect(thermalAtHour(file, 'nazare', 0)).toBe(0);
    expect(thermalAtHour(file, 'nazare', indexForHourOfDay(file.times, 17))).toBe(1);
  });
});

describe('mapHours — motor v6 em kitesurf e surf (#218, PR 2)', () => {
  // 3–5/9, horas de Lisboa; agora = 3/9 08:00 WEST
  const times = Array.from({ length: 72 }, (_, i) => {
    const day = String(3 + Math.floor(i / 24)).padStart(2, '0');
    const hh = String(i % 24).padStart(2, '0');
    return `2026-09-${day}T${hh}:00`;
  });
  const now = new Date('2026-09-03T07:00:00.000Z');
  const linha = (t: string) => ({ ...hour(t, 1.6, 0.5), windSpeed: 9, windDirection: 0, windGust: 10 });

  function build(forecasts: Record<string, Array<Record<string, unknown>>>, conditions = {}) {
    return buildMapHoursFile({ now, generatedAt: 'x', spots: [spot('nazare')], conditions, forecasts });
  }

  it('de noite kitesurf e surf são null; as outras modalidades e `best` continuam números', () => {
    const file = build({ nazare: times.map(linha) });
    const noite = file.times.findIndex((t) => t.endsWith('T23:00'));
    expect(noite).toBeGreaterThan(0);
    const row = file.spots.nazare;
    expect(row.kitesurf[noite]).toBeNull();
    expect(row.surf[noite]).toBeNull();
    for (const sport of ['windsurf', 'wakeboard', 'bodyboard', 'sup', 'foil']) {
      expect(typeof row[sport][noite]).toBe('number');
    }
    expect(typeof row.best[noite]).toBe('number');
    expect(scoreAtHour(file, 'nazare', 'surf', noite)).toBeNull();
    expect(scoreAtHour(file, 'nazare', 'big-wave', noite)).toBeNull();
    expect(Number.isFinite(scoreAtHour(file, 'nazare', 'all', noite))).toBe(true);
  });

  it('de dia kitesurf e surf são nota × 10 e `best` = máximo das modalidades com número', () => {
    const file = build({ nazare: times.map(linha) });
    const row = file.spots.nazare;
    const dia = file.times.findIndex((t) => t.endsWith('T14:00'));
    for (const sport of ['kitesurf', 'surf']) {
      const v = row[sport][dia];
      expect(typeof v).toBe('number');
      expect((v as number) % 10).toBe(0);
    }
    file.times.forEach((_, i) => {
      const nums = Object.entries(row)
        .filter(([k]) => k !== 'best')
        .map(([, s]) => s[i])
        .filter((v): v is number => typeof v === 'number');
      expect(row.best[i]).toBe(Math.max(0, ...nums));
    });
  });

  it('hora em falta na série (e não é «agora») → null em kitesurf e surf, sem herdar a linha ao vivo', () => {
    // a 1.ª série (guincho, completa) dá as horas do mapa; a da Nazaré não tem as 14:00 de 3/9
    const file = buildMapHoursFile({
      now,
      generatedAt: 'x',
      spots: [spot('guincho'), spot('nazare')],
      conditions: { nazare: linha(times[8]) },
      forecasts: {
        guincho: times.map(linha),
        nazare: times.filter((_, k) => k !== 14).map(linha),
      },
    });
    const i = file.times.indexOf(times[14]);
    expect(i).toBeGreaterThan(0);
    expect(file.spots.guincho.surf[i]).not.toBeNull();
    expect(file.spots.nazare.kitesurf[i]).toBeNull();
    expect(file.spots.nazare.surf[i]).toBeNull();
    // o motor antigo continua a cair na linha ao vivo nessa hora (inalterado)
    expect(typeof file.spots.nazare.windsurf[i]).toBe('number');
  });

  it('vento em falta na hora (null na fonte) → kitesurf null, surf continua com nota', () => {
    const semVento = build({ nazare: times.map((t) => ({ ...linha(t), windSpeed: null })) });
    const dia = semVento.times.findIndex((t) => t.endsWith('T14:00'));
    expect(semVento.spots.nazare.kitesurf[dia]).toBeNull();
    expect(typeof semVento.spots.nazare.surf[dia]).toBe('number');
  });

  it('frame «agora» usa a linha ao vivo (conditions.json), como o motor antigo', () => {
    const calmo = build({ nazare: times.map(linha) });
    const forte = build(
      { nazare: times.map(linha) },
      { nazare: { ...linha('2026-09-03T08:00'), waveHeight: 0.2, wavePeriod: 5 } },
    );
    expect(forte.spots.nazare.surf[0]).not.toBe(calmo.spots.nazare.surf[0]);
    expect(forte.spots.nazare.surf.slice(1)).toEqual(calmo.spots.nazare.surf.slice(1));
  });
});

describe('scoreAtHour — null (noite) ≠ undefined (sem dados)', () => {
  const file = {
    generatedAt: 'x',
    stepHours: 3,
    times: ['2026-09-03T20:00', '2026-09-03T23:00'],
    sports: ['surf'],
    spots: { nazare: { surf: [40, null], best: [40, 55] } },
  } as unknown as MapHoursFile;

  it('número, null e undefined', () => {
    expect(scoreAtHour(file, 'nazare', 'surf', 0)).toBe(40);
    expect(scoreAtHour(file, 'nazare', 'surf', 1)).toBeNull();
    expect(scoreAtHour(file, 'nazare', 'all', 1)).toBe(55);
    expect(scoreAtHour(file, 'nazare', 'surf', 2)).toBeUndefined();
    expect(scoreAtHour(file, 'nazare', 'kitesurf', 0)).toBeUndefined();
    expect(scoreAtHour(file, 'ghost', 'surf', 0)).toBeUndefined();
    expect(scoreAtHour(null, 'nazare', 'surf', 0)).toBeUndefined();
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
