import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  AZORES_TZ,
  LISBON_TZ,
  MADEIRA_TZ,
  localIso,
  localizeHourly,
  seriesTimeMs,
  spotTimeZone,
  utcRequestParams,
} = require('../openMeteoUtc.js');
const { findCurrentHourIndex } = require('../openMeteoTime.js');

const H = 3_600_000;

/** Simula a resposta do Open-Meteo com `timezone=GMT&timeformat=unixtime&start_hour/end_hour`. */
function respostaUtc(startHour, endHour) {
  const a = Date.parse(`${startHour}:00Z`);
  const b = Date.parse(`${endHour}:00Z`);
  const time = [];
  for (let t = a; t <= b; t += H) time.push(t / 1000);
  return { utc_offset_seconds: 0, timezone: 'GMT', hourly: { time, wave_height: time.map((_, i) => i) } };
}

describe('openMeteoUtc — mudança de hora de 25/10/2026 (auditoria M1)', () => {
  // pedido feito a 24/10 às 10:00 de Lisboa (09:00Z), 3 dias locais: 24, 25 e 26/10
  const nowMs = Date.parse('2026-10-24T09:00:00Z');
  const p = utcRequestParams({ tz: LISBON_TZ, nowMs, days: 3 });

  it('pede em UTC a janela exacta dos dias locais (24/10 00:00 WEST → 26/10 23:00 WET)', () => {
    expect(p).toEqual({
      timezone: 'GMT',
      timeformat: 'unixtime',
      start_hour: '2026-10-23T23:00',
      end_hour: '2026-10-26T23:00',
    });
  });

  const json = localizeHourly(respostaUtc(p.start_hour, p.end_hour), LISBON_TZ);
  const t = json.hourly.time;

  it('73 etiquetas = 72 passos de exactamente 1 h real, sem buracos nem duplicados de instante', () => {
    expect(t).toHaveLength(73);
    const ms = t.map((x) => Date.parse(x));
    for (let i = 1; i < ms.length; i++) expect(ms[i] - ms[i - 1]).toBe(H);
    expect(new Set(ms).size).toBe(73);
    expect(t[0]).toBe('2026-10-24T00:00+01:00');
    expect(t[72]).toBe('2026-10-26T23:00+00:00');
  });

  it('o 01:00 de 25/10 aparece duas vezes: WEST (+01:00) e depois WET (+00:00)', () => {
    const uma = t.filter((x) => x.startsWith('2026-10-25T01'));
    expect(uma).toEqual(['2026-10-25T01:00+01:00', '2026-10-25T01:00+00:00']);
    const i = t.indexOf('2026-10-25T01:00+01:00');
    expect(t[i - 1]).toBe('2026-10-25T00:00+01:00');
    expect(t[i + 2]).toBe('2026-10-25T02:00+00:00');
  });

  it('dias locais com 24, 25 e 24 horas', () => {
    const porDia = {};
    for (const x of t) porDia[x.slice(0, 10)] = (porDia[x.slice(0, 10)] ?? 0) + 1;
    expect(porDia).toEqual({ '2026-10-24': 24, '2026-10-25': 25, '2026-10-26': 24 });
  });

  it('as horas depois da mudança têm a etiqueta certa mesmo num pedido feito ainda em WEST', () => {
    // antes (timezone=Europe/Lisbon, offset único +01:00): 26/10 12:00Z vinha etiquetado «13:00»
    const i = t.findIndex((x) => Date.parse(x) === Date.parse('2026-10-26T12:00:00Z'));
    expect(t[i]).toBe('2026-10-26T12:00+00:00');
  });

  it('«agora» no segundo 01:00 (01:30 WET = 01:30Z) cai na hora +00:00, não na primeira', () => {
    const i = findCurrentHourIndex(t, new Date('2026-10-25T01:30:00Z'));
    expect(t[i]).toBe('2026-10-25T01:00+00:00');
    const j = findCurrentHourIndex(t, new Date('2026-10-25T00:30:00Z'));
    expect(t[j]).toBe('2026-10-25T01:00+01:00');
  });

  it('a série dos dados fica alinhada com as etiquetas (índice i ↔ instante i)', () => {
    expect(json.hourly.wave_height[t.indexOf('2026-10-25T01:00+00:00')]).toBe(26);
    expect(json.timezone).toBe(LISBON_TZ);
  });
});

describe('openMeteoUtc — Açores e Madeira na hora deles (auditoria B3)', () => {
  it('fuso por spot pela caixa geográfica', () => {
    expect(spotTimeZone({ lat: 38.633, lon: -27.967 })).toBe(AZORES_TZ); // Fajã dos Cubres
    expect(spotTimeZone({ lat: 37.74, lon: -25.67 })).toBe(AZORES_TZ); // São Miguel
    expect(spotTimeZone({ lat: 32.65, lon: -16.9 })).toBe(MADEIRA_TZ); // Funchal
    expect(spotTimeZone({ lat: 38.733, lon: -9.473 })).toBe(LISBON_TZ); // Guincho
    expect(spotTimeZone({})).toBe(LISBON_TZ);
  });

  it('Açores: 3 dias locais com o 00:00 repetido (AZOST −00 → AZOT −01)', () => {
    const p = utcRequestParams({ tz: AZORES_TZ, nowMs: Date.parse('2026-10-24T09:00:00Z'), days: 3 });
    expect(p.start_hour).toBe('2026-10-24T00:00'); // 24/10 00:00 AZOST (+00:00)
    expect(p.end_hour).toBe('2026-10-27T00:00'); // 26/10 23:00 AZOT (−01:00)
    const t = localizeHourly(respostaUtc(p.start_hour, p.end_hour), AZORES_TZ).hourly.time;
    expect(t).toHaveLength(73);
    expect(t[0]).toBe('2026-10-24T00:00+00:00');
    expect(t.filter((x) => x.startsWith('2026-10-25T00'))).toEqual(['2026-10-25T00:00+00:00', '2026-10-25T00:00-01:00']);
    expect(t[72]).toBe('2026-10-26T23:00-01:00');
  });

  it('o mesmo instante tem etiquetas diferentes em Lisboa e nos Açores', () => {
    const ms = Date.parse('2026-10-16T12:00:00Z');
    expect(localIso(ms, LISBON_TZ)).toBe('2026-10-16T13:00+01:00');
    expect(localIso(ms, AZORES_TZ)).toBe('2026-10-16T12:00+00:00');
    expect(localIso(ms, MADEIRA_TZ)).toBe('2026-10-16T13:00+01:00');
    expect(localIso(Date.parse('2026-10-26T12:00:00Z'), AZORES_TZ)).toBe('2026-10-26T11:00-01:00');
  });

  it('«agora» numa série dos Açores escolhe a hora pelo instante, não pela chave de Lisboa', () => {
    const p = utcRequestParams({ tz: AZORES_TZ, nowMs: Date.parse('2026-10-16T12:00:00Z'), days: 1 });
    const t = localizeHourly(respostaUtc(p.start_hour, p.end_hour), AZORES_TZ).hourly.time;
    const i = findCurrentHourIndex(t, new Date('2026-10-16T12:20:00Z')); // 13:20 Lisboa, 12:20 Açores
    expect(t[i]).toBe('2026-10-16T12:00+00:00');
  });
});

describe('openMeteoUtc — compatibilidade', () => {
  it('seriesTimeMs: etiqueta com desvio, Z, e etiqueta antiga sem desvio (hora de Lisboa)', () => {
    expect(seriesTimeMs('2026-10-25T01:00+00:00')).toBe(Date.parse('2026-10-25T01:00:00Z'));
    expect(seriesTimeMs('2026-10-25T01:00+01:00')).toBe(Date.parse('2026-10-25T00:00:00Z'));
    expect(seriesTimeMs('2026-10-16T13:00')).toBe(Date.parse('2026-10-16T12:00:00Z'));
    expect(seriesTimeMs('2026-12-16T13:00')).toBe(Date.parse('2026-12-16T13:00:00Z'));
    expect(seriesTimeMs(1792893600)).toBe(1792893600000);
    expect(Number.isNaN(seriesTimeMs('lixo'))).toBe(true);
  });

  it('localizeHourly deixa respostas já em texto (mocks, fallback) como estão', () => {
    const j = { hourly: { time: ['2026-10-16T00:00'] } };
    expect(localizeHourly(j, LISBON_TZ).hourly.time).toEqual(['2026-10-16T00:00']);
    expect(localizeHourly(null, LISBON_TZ)).toBeNull();
  });

  it('janela normal de 7 dias fora da mudança de hora: 168 horas', () => {
    const p = utcRequestParams({ tz: LISBON_TZ, nowMs: Date.parse('2026-10-16T10:00:00Z'), days: 7 });
    expect(p.start_hour).toBe('2026-10-15T23:00');
    expect(p.end_hour).toBe('2026-10-22T22:00');
    expect(localizeHourly(respostaUtc(p.start_hour, p.end_hour), LISBON_TZ).hourly.time).toHaveLength(168);
  });
});

describe('openMeteoUtc — mudança de hora de 28/03/2027 (primavera, dia de 23 h)', () => {
  // etiqueta montada por partes: dia + 'T' + hora + desvio
  const L = (dia, hm, off) => dia + 'T' + hm + off;
  // pedido feito a 27/03/2027 às 10:00 WET (10:00 UTC), 3 dias locais: 27, 28 e 29/03
  const nowMs = Date.UTC(2027, 2, 27, 10);

  it('Lisboa: janela 27/03 00:00 WET → 29/03 23:00 WEST = 71 horas reais, sem buracos', () => {
    const p = utcRequestParams({ tz: LISBON_TZ, nowMs, days: 3 });
    expect(p.start_hour).toBe(L('2027-03-27', '00:00', ''));
    expect(p.end_hour).toBe(L('2027-03-29', '22:00', ''));
    const t = localizeHourly(respostaUtc(p.start_hour, p.end_hour), LISBON_TZ).hourly.time;
    expect(t).toHaveLength(71);
    for (let i = 1; i < t.length; i++) expect(seriesTimeMs(t[i]) - seriesTimeMs(t[i - 1])).toBe(H);
    expect(new Set(t.map(seriesTimeMs)).size).toBe(71);
    // o 01:00 de 28/03 não existe: 00:00 WET → 02:00 WEST
    const d28 = t.filter((x) => x.startsWith('2027-03-28T0')).slice(0, 3);
    expect(d28).toEqual([L('2027-03-28', '00:00', '+00:00'), L('2027-03-28', '02:00', '+01:00'), L('2027-03-28', '03:00', '+01:00')]);
    const porDia = {};
    for (const x of t) porDia[x.slice(0, 10)] = (porDia[x.slice(0, 10)] ?? 0) + 1;
    expect(porDia).toEqual({ '2027-03-27': 24, '2027-03-28': 23, '2027-03-29': 24 });
    // «agora» às 02:30 WEST (01:30 UTC) cai na hora 02:00+01:00
    expect(t[findCurrentHourIndex(t, new Date(Date.UTC(2027, 2, 28, 1, 30)))]).toBe(L('2027-03-28', '02:00', '+01:00'));
  });

  it('Açores: o 00:00 de 28/03 não existe (AZOT −01 → AZOST +00) e o dia tem 23 h', () => {
    const p = utcRequestParams({ tz: AZORES_TZ, nowMs, days: 3 });
    expect(p.start_hour).toBe(L('2027-03-27', '01:00', ''));
    expect(p.end_hour).toBe(L('2027-03-29', '23:00', ''));
    const t = localizeHourly(respostaUtc(p.start_hour, p.end_hour), AZORES_TZ).hourly.time;
    expect(t).toHaveLength(71);
    expect(t.filter((x) => x.startsWith('2027-03-28T00'))).toEqual([]);
    expect(t.filter((x) => x.startsWith('2027-03-27T23') || x.startsWith('2027-03-28T01'))).toEqual([
      L('2027-03-27', '23:00', '-01:00'),
      L('2027-03-28', '01:00', '+00:00'),
    ]);
    for (let i = 1; i < t.length; i++) expect(seriesTimeMs(t[i]) - seriesTimeMs(t[i - 1])).toBe(H);
  });

  it('etiqueta antiga sem desvio dentro do buraco (01:00 de 28/03) não rebenta: cai nas 02:00 WEST', () => {
    expect(seriesTimeMs(L('2027-03-28', '01:00', ''))).toBe(Date.UTC(2027, 2, 28, 1));
  });
});
