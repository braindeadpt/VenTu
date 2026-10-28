import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spots } from '@/lib/spots';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import { getSportScore, getHourlyScores } from '@/lib/sportScore';
import { rawToScoreInput } from '@/lib/scoreConditions';
import { getConditionsDataId } from '@/lib/spotConditionsSource';
import { loadSpotListings, type SpotListingData } from '@/lib/load-spot-data';
import { allScoresComV6, isNoite, notaV6DoSpot, notaV6EhNoite, scoreAgoraComV6, type NotaV6Agora } from '@/lib/notaV6Agora';
import { notasHorariasCompare } from '@/lib/compareHourlyScores';
import { horaDeLinha, type LinhaForecast } from '@/lib/horaSpot';
import { avaliaHorasSite, type ModalidadeSite } from '@/lib/modalidades';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';

/**
 * Motor único (#218), PR 4: as listas e páginas que faltavam lêem a nota v6.
 *
 * Sobre a fixture e2e (`tests/e2e/fixtures/data`, com `notaV6` em cada linha
 * do `conditions.json`), kitesurf e surf dão EXACTAMENTE o mesmo número em:
 * - o bake das listagens (`loadSpotListings`: /spots, home, /explorar,
 *   /modalidades, página /alerts — PR 3);
 * - favoritos e o picker do comparar (`scoreAgoraComV6` com a linha que cada
 *   página lê: `conditionsSource` primeiro);
 * - os cartões do comparar, o embed e a escolha do separador da página do
 *   spot (`allScoresComV6` com a linha de cada página);
 * - e, hora a hora, a tabela do comparar (`notasHorariasCompare`) = régua do
 *   spot (`avaliaHoras(horaDeLinha)`) = frames do `map-hours.json`.
 * Desde o PR 6 o mesmo vale para windsurf, bodyboard e foil (melhor das três
 * vertentes); só o SUP e o wakeboard continuam no `sportScore`.
 */
const ROOT = path.join(__dirname, '..', '..', '..');
const FIX = path.join(ROOT, 'tests/e2e/fixtures/data');
const IDS = ['guincho', 'nazare', 'lagoa-albufeira', 'lagos'] as const;
const V6: ReadonlyArray<readonly [SportType, ModalidadeSite & ('kite' | 'surf' | 'windsurf' | 'bodyboard' | 'foil')]> = [
  ['kitesurf', 'kite'],
  ['surf', 'surf'],
  ['windsurf', 'windsurf'],
  ['bodyboard', 'bodyboard'],
  ['foil', 'foil'],
];
const ANTIGOS = ['wakeboard', 'sup'] as const;

const ler = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const spotDe = (id: string) => (spots as Spot[]).find((s) => s.id === id)!;
const serieDe = (sp: Spot) => sp.conditionsSource ?? sp.id;

const conditions = ler('conditions.json') as Record<string, Record<string, unknown>>;
const mapHoursFix = ler('map-hours.json') as {
  times: string[];
  spots: Record<string, Record<string, Array<number | null>>>;
};

let tmp = '';
let bake: SpotListingData[] = [];

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pr4-listas-'));
  fs.mkdirSync(path.join(tmp, 'public'));
  fs.symlinkSync(FIX, path.join(tmp, 'public', 'data'), 'dir');
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
  try {
    bake = loadSpotListings();
  } finally {
    cwd.mockRestore();
  }
}, 120_000);

afterAll(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

/** A linha que favoritos, comparar e a página do spot lêem do conditions.json. */
const linhaPagina = (sp: Spot) => (conditions[getConditionsDataId(sp)] ?? conditions[sp.id]) as Record<string, unknown>;

describe('#218 PR 4 — favoritos, comparar, embed e página do spot lêem o notaV6 (todos os spots, 0 diferenças)', () => {
  it('as cinco v6 = bake das listagens = notaV6; SUP e wakeboard = sportScore (de noite, noite)', () => {
    const diferencas: string[] = [];
    let vistos = 0;
    for (const row of bake) {
      const sp = row.spot as Spot;
      const nv = notaV6DoSpot(sp, conditions) as NotaV6Agora | null;
      if (!nv) continue;
      vistos++;
      const pagina = linhaPagina(sp);
      const embed = (conditions[sp.id] ?? conditions[sp.slug]) as Record<string, unknown>;
      // favoritos / picker do comparar
      for (const [sport, mod] of V6) {
        const esperado = nv[mod] == null ? 0 : (nv[mod] as number) * 10;
        const fav = scoreAgoraComV6(sp, sport, rawToScoreInput(pagina), nv).score;
        const cartao = allScoresComV6(sp, rawToScoreInput(pagina), nv)[sport].score;
        const emb = allScoresComV6(sp, rawToScoreInput(embed), notaV6DoSpot(sp, conditions))[sport].score;
        const lista = row.allScores[sport].score;
        for (const [nome, v] of [
          ['favoritos', fav],
          ['comparar', cartao],
          ['embed', emb],
          ['listagens', lista],
        ] as const) {
          if (v !== esperado) diferencas.push(`${sp.id} ${sport} ${nome}: ${v} ≠ ${esperado}`);
        }
      }
      for (const sport of ANTIGOS) {
        // corte de noite (28/10): com o notaV6 de noite, SUP e wake também ficam noite (score 0)
        const deNoite = notaV6EhNoite(nv);
        const antigo = deNoite ? 0 : getSportScore(sp, sport, rawToScoreInput(pagina)).score;
        const agora = scoreAgoraComV6(sp, sport, rawToScoreInput(pagina), nv);
        if (agora.score !== antigo || isNoite(agora) !== deNoite) diferencas.push(`${sp.id} ${sport} D5`);
        // a linha do bake (viés regional aplicado ao input) também fica noite
        if (deNoite && !isNoite(row.allScores[sport])) diferencas.push(`${sp.id} ${sport} listagens noite`);
      }
    }
    expect(vistos).toBeGreaterThan(150);
    expect(diferencas).toEqual([]);
  });

  it('sem notaV6 → as v6 ficam «sem dados» (score 0; o motor antigo delas já não existe), SUP no antigo', () => {
    const sp = spotDe('guincho');
    const input = rawToScoreInput(linhaPagina(sp));
    for (const sport of ['kitesurf', 'surf', 'windsurf', 'bodyboard', 'foil'] as SportType[]) {
      expect(scoreAgoraComV6(sp, sport, input, null)).toMatchObject({ score: 0, rating: 'N/A', semDados: true });
    }
    expect(scoreAgoraComV6(sp, 'sup', input, null)).toEqual(getSportScore(sp, 'sup', input));
  });

  it('noite: kitesurf/surf sem nota → score 0 (fica no fundo do ranking, nunca «a bombar»)', () => {
    const sp = spotDe('guincho');
    const nv: NotaV6Agora = { t: '2026-09-08T23:00', kite: null, surf: null };
    const input = rawToScoreInput(linhaPagina(sp));
    expect(scoreAgoraComV6(sp, 'kitesurf', input, nv)).toMatchObject({ score: 0, rating: 'N/A' });
    expect(scoreAgoraComV6(sp, 'surf', input, nv)).toMatchObject({ score: 0, rating: 'N/A' });
  });
});

describe('#218 PR 4 — tabela horária do comparar = régua do spot = map-hours', () => {
  for (const id of IDS) {
    for (const [sport, mod] of V6) {
      it(`${id} × ${sport}: 48 h hora a hora`, () => {
        const sp = spotDe(id);
        const rows = (ler(`forecasts/${serieDe(sp)}.json`) as Array<Record<string, unknown>>).filter(
          (r) => typeof r?.time === 'string',
        );
        const times = rows.slice(0, 48).map((r) => String(r.time));
        const fallback = rawToScoreInput(linhaPagina(sp));
        const got = notasHorariasCompare(sp, sport, rows, times, fallback);
        const ed = editorialDe(sp);
        const linhas = rows as unknown as LinhaForecast[];
        let noites = 0;
        times.forEach((_, j) => {
          const h = horaDeLinha(linhas, j, { lat: sp.lat, lon: sp.lon, praiaVirada: ed.praiaVirada });
          const [av] = avaliaHorasSite(spotModalidadeDe(ed), mod, [h]);
          expect(got[j]).toBe(av.n == null ? null : av.n * 10);
          if (av.n == null) noites++;
        });
        // a fixture cobre noite e dia (08–09/09)
        expect(noites).toBeGreaterThan(0);
        expect(got.some((v) => v != null)).toBe(true);

        // frames 1.. do map-hours (frame 0 é a linha «agora», PR 3)
        const serie = mapHoursFix.spots[id]?.[sport];
        expect(Array.isArray(serie)).toBe(true);
        let comparadas = 0;
        mapHoursFix.times.forEach((t, k) => {
          if (k === 0) return;
          const j = times.findIndex((x) => x.slice(0, 16) === t.slice(0, 16));
          if (j < 0) return;
          expect(got[j]).toBe(serie[k]);
          comparadas++;
        });
        expect(comparadas).toBeGreaterThan(0);
      });
    }
  }

  it('hora ausente da série → null («—»); o SUP continua no getHourlyScores (motor antigo)', () => {
    const sp = spotDe('guincho');
    const rows = (ler(`forecasts/${serieDe(sp)}.json`) as Array<Record<string, unknown>>).slice(0, 12);
    const times = [...rows.map((r) => String(r.time)), '2099-01-01T00:00'];
    const fallback = rawToScoreInput(linhaPagina(sp));
    expect(notasHorariasCompare(sp, 'surf', rows, times, fallback).at(-1)).toBeNull();
    expect(notasHorariasCompare(sp, 'windsurf', rows, times, fallback).at(-1)).toBeNull();
    const ws = notasHorariasCompare(sp, 'sup', rows, times, fallback);
    const antigo = getHourlyScores(
      sp,
      'sup',
      rows.map((r) => ({
        time: String(r.time),
        waveHeight: (r.waveHeight as number) ?? 0,
        wavePeriod: (r.wavePeriod as number) ?? 0,
        windSpeed: (r.windSpeed as number) ?? 0,
        windDirection: (r.windDirection as number) ?? 0,
        windGust: (r.windGust as number) ?? fallback.windGust,
        waterTemp: (r.waterTemp as number) ?? fallback.waterTemp,
      })),
      fallback,
    );
    expect(ws.slice(0, 12)).toEqual(antigo);
    expect(ws.at(-1)).toBeNull();
  });
});
