/**
 * Auditoria M1/B3: séries pedidas em UTC e etiquetadas na hora de parede do
 * spot com desvio. Verifica o que vem a seguir no site: «agora» (horaSpot /
 * régua), sol, mapa (map-hours) e as horas de parede usadas para noite/manhã.
 */
import { describe, expect, it } from 'vitest';
import type { Spot } from '@/types';
import {
  findCoveredHourIndex,
  findCurrentHourIndex,
  lisbonIsoWithOffset,
  sameSeriesHour,
  seriesTimeMs,
  wallHourOf,
} from '@/lib/openMeteoTime';
import { construirHoras, horaDeLinha, type LinhaForecast } from '@/lib/horaSpot';
import { instanteLisboa, posicaoSol } from '@/lib/sol';
import { buildMapHoursFile, hsAtHour, mapHoursClock } from '@/lib/mapHours';

const H = 3_600_000;

/** Etiqueta dos Açores (−01:00 de inverno, +00:00 de verão), como o pipeline grava. */
function azoresIso(ms: number): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Atlantic/Azores', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]),
  );
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  const off = Math.round((wall - ms) / 60000);
  const o = `${off < 0 ? '-' : '+'}${String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')}:00`;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}${o}`;
}

const linha = (time: string, o: Partial<LinhaForecast> = {}): LinhaForecast => ({
  time,
  waveHeight: 1.5,
  wavePeriod: 11,
  waveDirection: 300,
  windSpeed: 6,
  windDirection: 340,
  windGust: 8,
  tideHeight: 0,
  waterTemp: 17,
  ...o,
});

// 24/10 00:00 WEST (23/10 23:00Z) → 26/10 23:00 WET (26/10 23:00Z): 73 horas reais
const t0 = Date.parse('2026-10-23T23:00:00Z');
const instantes = Array.from({ length: 73 }, (_, k) => t0 + k * H);
// waveHeight = índice da hora real (marcador) para saber QUE linha foi lida
const serieLx = instantes.map((ms, k) => linha(lisbonIsoWithOffset(ms), { waveHeight: k / 10 }));

describe('etiquetas com desvio — Lisboa 24–26/10/2026', () => {
  it('lisbonIsoWithOffset dá o 01:00 repetido e 72 passos de 1 h', () => {
    const t = serieLx.map((l) => l.time);
    expect(t.filter((x) => x.startsWith('2026-10-25T01'))).toEqual(['2026-10-25T01:00+01:00', '2026-10-25T01:00+00:00']);
    for (let i = 1; i < t.length; i++) expect(seriesTimeMs(t[i]) - seriesTimeMs(t[i - 1])).toBe(H);
    expect(t[0]).toBe('2026-10-24T00:00+01:00');
    expect(t[72]).toBe('2026-10-26T23:00+00:00');
  });

  it('«agora» escolhe a hora pelo instante (primeiro e segundo 01:00)', () => {
    const t = serieLx.map((l) => l.time);
    expect(t[findCoveredHourIndex(t, new Date('2026-10-25T00:30:00Z'))]).toBe('2026-10-25T01:00+01:00');
    expect(t[findCoveredHourIndex(t, new Date('2026-10-25T01:30:00Z'))]).toBe('2026-10-25T01:00+00:00');
    expect(t[findCurrentHourIndex(t, new Date('2026-10-26T12:10:00Z'))]).toBe('2026-10-26T12:00+00:00');
    expect(findCoveredHourIndex(t, new Date('2026-10-27T00:10:00Z'))).toBe(-1);
  });

  it('etiquetas antigas sem desvio continuam a ser hora de parede de Lisboa', () => {
    expect(findCoveredHourIndex(['2026-10-16T12:00', '2026-10-16T13:00'], new Date('2026-10-16T12:20:00Z'))).toBe(1);
    expect(sameSeriesHour('2026-10-16T13:00', '2026-10-16T13:00+01:00')).toBe(true);
    expect(sameSeriesHour('2026-10-16T13:00+01:00', '2026-10-16T12:00+00:00')).toBe(true);
  });

  it('wallHourOf lê a hora de parede da etiqueta (não o fuso da máquina)', () => {
    expect(wallHourOf('2026-10-25T01:00+00:00')).toBe(1);
    expect(wallHourOf('2026-10-16T21:00+01:00')).toBe(21);
    expect(wallHourOf('2026-10-16T20:00:00.000Z')).toBe(21);
    expect(wallHourOf('2026-10-16T11:00-01:00')).toBe(11);
  });
});

describe('horaSpot (página de spot, régua da home)', () => {
  const local = { lat: 38.733, lon: -9.473, praiaVirada: 280 };

  it('no segundo 01:00 a régua começa na linha +00:00 e avança em horas reais', () => {
    const d = construirHoras(serieLx, local, Date.parse('2026-10-25T01:30:00Z'), 6);
    expect(d.semAgora).toBe(false);
    expect(d.horas.map((h) => h.t)).toEqual([
      '2026-10-25T01:00', '2026-10-25T02:00', '2026-10-25T03:00', '2026-10-25T04:00', '2026-10-25T05:00', '2026-10-25T06:00',
    ]);
    expect(d.horas[0].hs).toBe(2.6); // linha k=26 (23/10 23Z + 26 h = 25/10 01:00Z)
  });

  it('no primeiro 01:00 começa na linha +01:00, e a seguinte é o 01:00 de inverno', () => {
    const d = construirHoras(serieLx, local, Date.parse('2026-10-25T00:30:00Z'), 3);
    expect(d.horas.map((h) => h.t)).toEqual(['2026-10-25T01:00', '2026-10-25T01:00', '2026-10-25T02:00']);
    expect(d.horas.map((h) => h.hs)).toEqual([2.5, 2.6, 2.7]);
  });

  it('o sol de cada hora usa o instante real (01:00 repetido e Açores)', () => {
    const j = serieLx.findIndex((l) => l.time === '2026-10-26T08:00+00:00');
    const h = horaDeLinha(serieLx, j, local);
    expect(h.sunEl).toBeCloseTo(posicaoSol(Date.parse('2026-10-26T08:00:00Z'), local.lat, local.lon).el, 6);

    const az = { lat: 38.633, lon: -27.967, praiaVirada: 0 };
    const serieAz = [linha('2026-10-16T08:00+00:00'), linha('2026-10-16T09:00+00:00')];
    const ha = horaDeLinha(serieAz, 0, az);
    expect(ha.t).toBe('2026-10-16T08:00'); // etiqueta na hora dos Açores
    expect(ha.sunEl).toBeCloseTo(posicaoSol(Date.parse('2026-10-16T08:00:00Z'), az.lat, az.lon).el, 6);
    // antes: a mesma etiqueta lida como hora de Lisboa (07:00Z) → sol 1 h mais cedo
    expect(Math.abs(ha.sunEl - posicaoSol(instanteLisboa('2026-10-16T08:00'), az.lat, az.lon).el)).toBeGreaterThan(5);
  });

  it('previsão expirada continua detectada por instante', () => {
    const d = construirHoras(serieLx, local, Date.parse('2026-10-28T10:00:00Z'), 4);
    expect(d.semAgora).toBe(true);
    expect(d.horas.at(-1)?.t).toBe('2026-10-26T23:00');
  });
});

function spot(id: string, lat: number, lon: number, region: string): Spot {
  return {
    id, slug: id, name: id, nameEn: id, region, regionEn: region, lat, lon,
    coastOrientation: 270, type: 'surf', difficulty: 'intermediate', bestWind: 'N', bestSwell: 'W',
    description: '', descriptionEn: '', facilities: [], hazards: [], compatibleSports: ['surf'],
  };
}

describe('map-hours (mapa): Açores e Lisboa na mesma hora real', () => {
  const az = spot('santa-barbara-az', 37.82, -25.53, 'São Miguel');
  const gu = spot('guincho', 38.733, -9.473, 'Cascais');
  const forecasts = {
    [az.id]: instantes.map((ms, k) => ({ ...linha(azoresIso(ms), { waveHeight: k / 10 }) }) as Record<string, unknown>),
    [gu.id]: instantes.map((ms, k) => ({ ...linha(lisbonIsoWithOffset(ms), { waveHeight: k / 10 }) }) as Record<string, unknown>),
  };

  it('as horas do mapa vêm de uma série de Lisboa mesmo com um spot dos Açores primeiro', () => {
    const file = buildMapHoursFile({ now: new Date('2026-10-24T09:10:00Z'), spots: [az, gu], conditions: {}, forecasts });
    expect(file.times[0]).toBe('2026-10-24T10:00+01:00');
    expect(mapHoursClock(file.times[0])).toBe('10h');
  });

  it('cada passo lê a linha do mesmo instante nos dois spots, também à volta da mudança de hora', () => {
    const file = buildMapHoursFile({ now: new Date('2026-10-24T22:10:00Z'), spots: [az, gu], conditions: {}, forecasts });
    // passos de 3 h REAIS: 23:00 WEST (22Z) → 01:00 WET (01Z) → 04:00 WET (04Z)
    expect(file.times.slice(0, 3)).toEqual(['2026-10-24T23:00+01:00', '2026-10-25T01:00+00:00', '2026-10-25T04:00+00:00']);
    for (let i = 0; i < file.times.length; i++) {
      expect(hsAtHour(file, az.id, i)).toBe(hsAtHour(file, gu.id, i));
    }
    expect(hsAtHour(file, gu.id, 1)).toBe(2.6); // 25/10 01:00Z = k 26
  });
});
