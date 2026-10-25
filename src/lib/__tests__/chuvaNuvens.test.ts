import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { spots } from '@/lib/spots';
import type { Spot } from '@/types';
import { chuvaDe, construirHoras, horaDeLinha, type LinhaForecast } from '@/lib/horaSpot';
import { avaliaHoras, MODALIDADES_DEF, type DefOnda, type DefVento } from '@/lib/modalidades';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';
import { notaV6DeCondicoes } from '@/lib/notaV6Condicoes';

/**
 * #218 (PR 1, §1 da issue): chuva e nuvens no forecast.
 * - pipeline: mesma chamada e mesma hora do vento (Open-Meteo forecast),
 *   formato compacto (`cloudCover` sempre, `precipitation` só quando chove);
 * - `horaDeLinha`: 0 mm/h quando a linha tem `cloudCover` sem `precipitation`,
 *   `null` sem dados de tempo (sem penalização, como hoje);
 * - o motor v6 penaliza a chuva pela definição (`chuva`), na página do spot,
 *   na home e nos alertas (a mesma função).
 */
const require = createRequire(import.meta.url);
const { mergeForecast, rainCloudFields } = require('../../../scripts/lib/updateConditionsMerge.js');
const { buildWeatherParams } = require('../../../scripts/lib/updateConditionsFetch.js');
const { findImplausibleValues } = require('../../../scripts/lib/dataPlausibility.js');

const guincho = (spots as Spot[]).find((s) => s.id === 'guincho')!;
const ed = editorialDe(guincho);
const sp = spotModalidadeDe(ed);
const local = { lat: guincho.lat, lon: guincho.lon, praiaVirada: ed.praiaVirada };
const KITE = MODALIDADES_DEF.def.kite as DefVento;
const SURF = MODALIDADES_DEF.def.surf as DefOnda;

/** Uma hora de dia em setembro, kite de nortada a 20 kt (lateral de mar) e surf 1,5 m / 12 s. */
const linha = (o: Partial<LinhaForecast> = {}): LinhaForecast => ({
  time: '2026-09-08T14:00+01:00',
  windSpeed: 20 / 1.94384,
  windGust: 23 / 1.94384,
  windDirection: (ed.praiaVirada + 50) % 360,
  waveHeight: 1.5,
  wavePeriod: 12,
  waveDirection: ed.praiaVirada,
  waterTemp: 18,
  tideHeight: 0,
  ...o,
});

describe('pipeline: chuva e nuvens na mesma chamada do vento', () => {
  it('o pedido do tempo (forecast) leva precipitation e cloud_cover, sem pedidos novos', () => {
    const hourly = buildWeatherParams(38.73, -9.47).get('hourly').split(',');
    expect(hourly).toEqual(expect.arrayContaining(['wind_speed_10m', 'precipitation', 'cloud_cover']));
    // menos de 11 variáveis: a Open-Meteo continua a contar 1 chamada
    expect(hourly.length).toBeLessThanOrEqual(10);
  });

  it('mergeForecast: cloudCover inteiro sempre; precipitation só quando chove; null nunca vira 0', () => {
    const marine = { hourly: { time: ['a', 'b', 'c', 'd'], wave_height: [1, 1, 1, 1], wave_period: [10, 10, 10, 10] } };
    const weather = {
      hourly: {
        time: ['a', 'b', 'c', 'd'],
        wind_speed_10m: [3, 3, 3, 3],
        wind_direction_10m: [0, 0, 0, 0],
        wind_gusts_10m: [4, 4, 4, 4],
        precipitation: [0, 0.04, 1.26, null],
        cloud_cover: [12.4, 100, 87, null],
      },
    };
    const rows = mergeForecast(marine, weather);
    expect(rows[0]).toMatchObject({ cloudCover: 12 });
    expect(rows[0]).not.toHaveProperty('precipitation');
    expect(rows[1]).toMatchObject({ cloudCover: 100 });
    expect(rows[1]).not.toHaveProperty('precipitation'); // 0,04 → 0,0 mm/h
    expect(rows[2]).toMatchObject({ cloudCover: 87, precipitation: 1.3 });
    expect(rows[3]).not.toHaveProperty('cloudCover');
    expect(rows[3]).not.toHaveProperty('precipitation');
  });

  it('séries antigas sem as variáveis: as linhas ficam exactamente como hoje', () => {
    expect(rainCloudFields({ wind_speed_10m: [3] }, 0)).toEqual({});
    // chuva sem nuvens: o 0 fica explícito (não há marca)
    expect(rainCloudFields({ precipitation: [0] }, 0)).toEqual({ precipitation: 0 });
    expect(rainCloudFields({ precipitation: [-0.2], cloud_cover: [140] }, 0)).toEqual({ cloudCover: 100 });
  });

  it('validador de dados: chuva e nuvens fora do intervalo físico falham', () => {
    expect(findImplausibleValues({ x: [{ precipitation: 3, cloudCover: 40 }] })).toEqual([]);
    const v = findImplausibleValues({ x: [{ precipitation: 999, cloudCover: 101 }] });
    expect(v.map((e: { key: string }) => e.key).sort()).toEqual(['cloudCover', 'precipitation']);
  });
});

describe('horaDeLinha: a chuva da linha', () => {
  it('chuvaDe: valor; 0 com cloudCover sem precipitation; null sem dados de tempo', () => {
    expect(chuvaDe({ precipitation: 0.7, cloudCover: 90 })).toBe(0.7);
    expect(chuvaDe({ cloudCover: 30 })).toBe(0);
    expect(chuvaDe({ cloudCover: 0 })).toBe(0);
    expect(chuvaDe({})).toBeNull();
    expect(chuvaDe({ precipitation: 0 })).toBe(0);
  });

  it('a hora leva cloud e rain; construirHoras deixa de dizer que faltam', () => {
    const h = horaDeLinha([linha({ cloudCover: 75, precipitation: 0.6 })], 0, local);
    expect(h.cloud).toBe(75);
    expect(h.rain).toBe(0.6);
    const seco = horaDeLinha([linha({ cloudCover: 10 })], 0, local);
    expect(seco.rain).toBe(0);
    const linhas = [linha({ time: '2026-09-08T13:00+01:00', cloudCover: 10 }), linha({ cloudCover: 20 })];
    const d = construirHoras(linhas, local, Date.parse('2026-09-08T12:30:00Z'), 2);
    expect(d.faltam).not.toContain('rain');
    expect(d.faltam).not.toContain('cloud');
  });
});

describe('motor v6: degradação sem dados e penalização com chuva', () => {
  const nota = (d: 'kite' | 'surf', l: LinhaForecast) => avaliaHoras(sp, d, [horaDeLinha([l], 0, local)])[0].n;

  it('sem dados de chuva (forecasts antigos, fixture): a nota é igual à de 0 mm/h — zero penalização', () => {
    for (const d of ['kite', 'surf'] as const) {
      const sem = nota(d, linha());
      expect(sem).not.toBeNull();
      expect(nota(d, linha({ cloudCover: 100 }))).toBe(sem);
      expect(nota(d, linha({ cloudCover: 100, precipitation: 0 }))).toBe(sem);
    }
    // e a UI continua a dizer que faltam (como hoje)
    const d = construirHoras([linha()], local, Date.parse('2026-09-08T13:30:00Z'), 1);
    expect(d.faltam).toEqual(expect.arrayContaining(['rain', 'cloud']));
  });

  it('chuva acima dos degraus da definição baixa a nota (kite e surf)', () => {
    const kSeco = nota('kite', linha({ cloudCover: 100 }))!;
    const kChuva = nota('kite', linha({ cloudCover: 100, precipitation: 2 }))!;
    // > 1,5 mm/h: −2,5 (degrau mais alto da definição do kite)
    expect(KITE.chuva[KITE.chuva.length - 1]).toEqual([1.5, 2.5]);
    expect(kSeco - kChuva).toBeGreaterThanOrEqual(2);
    // abaixo do primeiro degrau não conta
    expect(nota('kite', linha({ cloudCover: 100, precipitation: KITE.chuva[0][0] }))).toBe(kSeco);
    const sSeco = nota('surf', linha({ cloudCover: 100 }))!;
    const sChuva = nota('surf', linha({ cloudCover: 100, precipitation: SURF.chuva[0][0] + 1 }))!;
    expect(sChuva).toBeLessThanOrEqual(sSeco);
  });

  it('alertas (notaV6DeCondicoes): a mesma chuva da linha do forecast entra na nota', () => {
    const t = '2026-09-08T14:00+01:00';
    const seco = notaV6DeCondicoes(guincho, 'kitesurf', { ...linha(), cloudCover: 100 }, { t })!;
    const chuva = notaV6DeCondicoes(guincho, 'kitesurf', { ...linha(), cloudCover: 100, precipitation: 2 }, { t })!;
    const semDados = notaV6DeCondicoes(guincho, 'kitesurf', { ...linha() }, { t })!;
    expect(semDados.n).toBe(seco.n);
    expect(chuva.n!).toBeLessThan(seco.n!);
    expect(chuva.n).toBe(nota('kite', linha({ cloudCover: 100, precipitation: 2 })));
  });
});
