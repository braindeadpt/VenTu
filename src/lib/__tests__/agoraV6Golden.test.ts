import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spots } from '@/lib/spots';
import type { Spot } from '@/types';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import { spotMatchesSportFilter, spotMeetsOnFilter } from '@/lib/gridSpotFilters';
import { getGridSpotScore } from '@/lib/gridSpotScore';
import { getBestScore } from '@/components/spots/mapSpotData';
import { getExplainedWindSafety, getSpotScoreFactors, resolveExplainedSport } from '@/lib/spotScoreFactors';
import { getMapSpotNarrative } from '@/lib/mapSpotNarrative';
import { scoreToNota } from '@/lib/nota';
import type { SportType } from '@/lib/sportRatings';
import { loadWaveBiasRegionsBuild } from '@/lib/waveBias';
import { loadSpotListings, type SpotListingData } from '@/lib/load-spot-data';
import { refreshGridSpotScores } from '@/lib/refreshGridSpotScores';
import { buildMapHoursFile } from '@/lib/mapHoursBuild';
import { findCoveredHourIndex } from '@/lib/openMeteoTime';
import { horaDeLinha, type LinhaForecast } from '@/lib/horaSpot';
import { avaliaHorasSite } from '@/lib/modalidades';
import { melhorTodos } from '@/lib/desportosV6';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';
import { notaV6AgoraDe } from '@/lib/notaV6AgoraBuild';
import { notaV6DoSpot, type NotaV6Agora, type SportScoreAgoraV6 } from '@/lib/notaV6Agora';

/**
 * Motor único (#218), PR 3: golden do «agora» v6 do /mapa.
 *
 * Sobre a fixture e2e (`tests/e2e/fixtures/data`, 08/09 08:45), para
 * Guincho, Nazaré, Lagoa de Albufeira e Meia Praia (Algarve), as cinco
 * modalidades v6 (kitesurf, surf e, desde o PR 6, windsurf, bodyboard e foil)
 * têm de dar EXACTAMENTE o mesmo número em:
 * - `allScores.<desporto>.score / 10` do bake (`loadSpotListings` → `buildSpotData`);
 * - o mesmo do refresh do cliente (`refreshGridSpotScores`);
 * - a nota do `SpotV6` na hora coberta (`avaliaHoras(horaDeLinha(forecast, i0))`);
 * - a nota do alerta (`computeAlertScore`: hora corrente do forecast + observações);
 * - a frame 0 do `map-hours.json` (`buildMapHoursFile` e a fixture e2e).
 * E o `notaV6` gravado na fixture é o que o pipeline gravaria hoje (fixture actual).
 *
 * O teste das superfícies percorre os 189 spots da fixture: marcador e lista
 * (`getBestScore`), filtros e «Só ON» (`getGridSpotScore`, `spotMeetsOnFilter`),
 * popup e pré-visualização (desporto explicado, aviso de vento, factores,
 * narrativa) — 0 diferenças para o `notaV6`.
 */
const ROOT = path.join(__dirname, '..', '..', '..');
const FIX = path.join(ROOT, 'tests/e2e/fixtures/data');
const IDS = ['guincho', 'nazare', 'lagoa-albufeira', 'lagos'] as const;
const SPORTS = [
  ['kitesurf', 'kite'],
  ['surf', 'surf'],
  ['windsurf', 'windsurf'],
  ['bodyboard', 'bodyboard'],
  ['foil', 'foil'],
] as const;

const ler = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const serieDe = (sp: Spot) => sp.conditionsSource ?? sp.id;
const spotDe = (id: string) => (spots as Spot[]).find((s) => s.id === id)!;

const req = createRequire(import.meta.url);
const { computeAlertScore, makeForecastReader } = req('../../../scripts/lib/scoreSpotConditions.js') as {
  computeAlertScore: (
    id: string,
    sport: string,
    cond: Record<string, unknown>,
    opc: { nowMs: number; forecastFor: (id: string) => unknown },
  ) => { night: true } | { nota: number } | null;
  makeForecastReader: (dir: string) => (id: string) => unknown;
};

const mapHoursFix = ler('map-hours.json') as { generatedAt: string; times: string[]; spots: Record<string, Record<string, Array<number | null>>> };
const NOW = new Date(mapHoursFix.generatedAt);
const conditions = ler('conditions.json') as Record<string, Record<string, unknown>>;

let tmp = '';
let bake: SpotListingData[] = [];
let refresh: SpotListingData[] = [];

beforeAll(() => {
  // o bake lê public/data do cwd: aponta-o para a fixture
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agora-v6-'));
  fs.mkdirSync(path.join(tmp, 'public'));
  fs.symlinkSync(FIX, path.join(tmp, 'public', 'data'), 'dir');
  const bias = loadWaveBiasRegionsBuild(null, path.join(FIX, 'wave-bias.json'));
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
  try {
    bake = loadSpotListings();
  } finally {
    cwd.mockRestore();
  }
  refresh = refreshGridSpotScores(bake as unknown as GridSpotData[], conditions, bias) as unknown as SpotListingData[];
});

afterAll(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

const linhaDe = (rows: SpotListingData[], id: string) => rows.find((r) => r.spot.id === id)!;

describe('«agora» v6 no /mapa (#218, PR 3) — golden das fixtures', () => {
  it('o notaV6 da fixture e2e é o que o pipeline grava hoje (regenerar: scripts/build-nota-v6-agora.js)', () => {
    const reader = makeForecastReader(FIX) as (id: string) => Array<Record<string, unknown>> | null;
    const diferencas: string[] = [];
    for (const sp of spots as Spot[]) {
      const own = conditions[sp.id];
      if (!own) continue;
      const hours = reader(sp.id) ?? (sp.conditionsSource ? reader(sp.conditionsSource) : null);
      const esperado = notaV6AgoraDe(sp, own, hours, NOW.getTime());
      if (JSON.stringify(own.notaV6) !== JSON.stringify(esperado)) diferencas.push(sp.id);
    }
    expect(diferencas).toEqual([]);
  });

  for (const id of IDS) {
    for (const [sport, mod] of SPORTS) {
      it(`${id} × ${sport}: bake = refresh = SpotV6 na hora coberta = alerta = map-hours frame 0`, () => {
        const sp = spotDe(id);
        const nv = notaV6DoSpot(sp, conditions)!;
        expect(nv).not.toBeNull();
        const n = nv[mod];

        // bake e refresh: score / 10 (noite → score 0 + noite)
        for (const rows of [bake, refresh]) {
          const s = linhaDe(rows, id).allScores[sport] as SportScoreAgoraV6;
          if (n == null) expect(s).toMatchObject({ score: 0, noite: true });
          else expect(s.score / 10).toBe(n);
        }

        // SpotV6: a régua do spot na hora coberta (forecast puro)
        const linhas = (ler(`forecasts/${serieDe(sp)}.json`) as LinhaForecast[]).filter((l) => typeof l?.time === 'string');
        const i0 = findCoveredHourIndex(linhas.map((l) => l.time), NOW);
        expect(i0).toBeGreaterThanOrEqual(0);
        const ed = editorialDe(sp);
        const h = horaDeLinha(linhas, i0, { lat: sp.lat, lon: sp.lon, praiaVirada: ed.praiaVirada });
        const [av] = avaliaHorasSite(spotModalidadeDe(ed), mod, [h]);
        expect(av.n).toBe(n);
        expect(nv.t).toBe(linhas[i0].time.slice(0, 16));

        // alerta: hora corrente do forecast + observações frescas
        const alerta = computeAlertScore(id, sport, conditions, { nowMs: NOW.getTime(), forecastFor: makeForecastReader(FIX) });
        if (n == null) expect(alerta && 'night' in alerta).toBe(true);
        else expect(alerta && 'nota' in alerta ? alerta.nota : undefined).toBe(n);

        // map-hours frame 0: o build e a fixture e2e
        const mh = buildMapHoursFile({
          forecasts: { [serieDe(sp)]: ler(`forecasts/${serieDe(sp)}.json`) },
          conditions,
          spots: [sp],
          now: NOW,
          generatedAt: mapHoursFix.generatedAt,
        });
        expect(findCoveredHourIndex([mh.times[0]], NOW)).toBe(0);
        const esperado = n == null ? null : n * 10;
        expect(mh.spots[id][sport][0]).toBe(esperado);
        expect(mapHoursFix.spots[id][sport][0]).toBe(esperado);
      });
    }
  }

  it('bake e refresh dão o MESMO número nas cinco v6 em todos os spots (uma atribuição, sem motor)', () => {
    const diferencas: string[] = [];
    for (const row of bake) {
      const r = linhaDe(refresh, row.spot.id);
      for (const [sport] of SPORTS) {
        if (JSON.stringify(row.allScores[sport]) !== JSON.stringify(r.allScores[sport])) diferencas.push(`${row.spot.id} ${sport}`);
      }
    }
    expect(bake.length).toBeGreaterThan(150);
    expect(diferencas).toEqual([]);
  });
});

/** Tipos de factor que a linha «porquê» desenha a partir dos `factorsEn` do pipeline. */
function tiposDe(f: readonly string[]): string[] {
  const out: string[] = [];
  for (const x of f) {
    const k = /m waves$|^Small waves$/.test(x)
      ? 'waves'
      : /s period$/.test(x)
        ? 'period'
        : /wind$|^(offshore|onshore|side-offshore|side-onshore|cross-shore)$/.test(x)
          ? 'wind'
          : 'other';
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

describe('«agora» v6 — as superfícies do /mapa lêem o notaV6 (189 spots, 0 diferenças)', () => {
  it('marcador, lista, filtros, «Só ON», popup e pré-visualização', () => {
    const diferencas: string[] = [];
    let vistos = 0;
    for (const rows of [bake, refresh]) {
      for (const row of rows) {
        const nv = notaV6DoSpot(row.spot, conditions) as NotaV6Agora;
        if (!nv) {
          diferencas.push(`${row.spot.id}: sem notaV6`);
          continue;
        }
        vistos++;
        const data = row as unknown as GridSpotData;
        for (const [filtro, mod] of [...SPORTS, ['big-wave', 'surf']] as const) {
          const n = nv[mod] ?? null;
          const nota = n ?? 0;
          const id = `${row.spot.id} ${filtro}`;
          // marcador e lista sincronizada (MapExploreZone / useMapMarkers): getBestScore sem override
          if (scoreToNota(getBestScore(data, filtro)) !== nota) diferencas.push(`${id}: marcador`);
          // cartões / ranking / filtros
          const grid = getGridSpotScore(data, filtro);
          const gridEsperado = filtro === 'big-wave' && row.spot.type !== 'big-wave' ? 0 : nota * 10;
          if (grid !== gridEsperado) diferencas.push(`${id}: grelha ${grid} ≠ ${gridEsperado}`);
          // «Só ON» (nota ≥ 7)
          const on = spotMatchesSportFilter(data, filtro) && grid >= 65;
          if (spotMeetsOnFilter(data, filtro) !== on || (on && nota < 7)) diferencas.push(`${id}: Só ON`);
          // estado noite / sem dados no SportScore
          const s = row.allScores[filtro === 'big-wave' ? 'surf' : filtro] as SportScoreAgoraV6;
          if (n == null && !(s.noite || s.semDados)) diferencas.push(`${id}: noite sem marca`);
          if (n != null && (s.noite || s.semDados)) diferencas.push(`${id}: marca noite de dia`);
        }
        for (const [filtro, mod] of SPORTS) {
          const n = nv[mod] ?? null;
          const id = `${row.spot.id} ${filtro}`;
          // popup e pré-visualização: desporto explicado, aviso de vento e factores
          if (resolveExplainedSport(row.spot, row.allScores, filtro) !== filtro) diferencas.push(`${id}: desporto explicado`);
          const aviso = getExplainedWindSafety(row.spot, row.allScores, filtro);
          const avisoEsperado =
            n == null ? null : mod === 'kite' ? (nv.seg ?? null) : mod === 'windsurf' || mod === 'foil' ? (nv.sg?.[mod] ?? null) : null;
          if (aviso !== avisoEsperado) diferencas.push(`${id}: aviso ${aviso} ≠ ${avisoEsperado}`);
          const segs = getSpotScoreFactors({ spot: row.spot, conditions: row.conditions, allScores: row.allScores, sport: filtro, locale: 'pt', max: 6 });
          const f = n == null ? [] : (nv.f?.[mod] ?? []);
          const kinds = segs.map((x) => x.kind).filter((k) => k !== 'swell');
          // sem factores (noite) a linha cai nas métricas canónicas (ondas, período, vento)
          const esperado = f.length ? tiposDe(f) : ['waves', 'period', 'wind'];
          if (JSON.stringify(kinds) !== JSON.stringify(esperado)) diferencas.push(`${id}: factores ${kinds} ≠ ${esperado}`);
          const narr = getMapSpotNarrative(row.spot, row.conditions, row.allScores, filtro as SportType, 'pt');
          if (typeof narr !== 'string' && narr != null && typeof narr !== 'object') diferencas.push(`${id}: narrativa`);
        }
        // «Todos» (PR 6): máximo das v6 do notaV6; SUP / wakeboard só num spot sem nenhuma v6 compatível
        const v6 = { kitesurf: nv.kite, surf: nv.surf, windsurf: nv.windsurf, bodyboard: nv.bodyboard, foil: nv.foil } as Record<string, number | null | undefined>;
        const todos =
          melhorTodos(row.spot, (s) => (s in v6 ? (v6[s] == null ? null : (v6[s] as number) * 10) : row.allScores[s]?.score)) ?? 0;
        if (getBestScore(data, 'all') !== todos || getGridSpotScore(data, 'all') !== todos)
          diferencas.push(`${row.spot.id}: Todos ${getBestScore(data, 'all')} ≠ ${todos}`);
      }
    }
    expect(vistos).toBe(bake.length * 2);
    expect(diferencas).toEqual([]);
  });
});
