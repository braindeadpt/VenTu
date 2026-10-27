import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spots } from '@/lib/spots';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import { rawToScoreInput } from '@/lib/scoreConditions';
import { horaDeLinha, type LinhaForecast } from '@/lib/horaSpot';
import { avaliaHoras, MODALIDADES_DEF } from '@/lib/modalidades';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';
import { notaV6DoSpot, type NotaV6Agora } from '@/lib/notaV6Agora';
import { janelasV6, melhorJanelaV6, JANELA_NOTA_MIN } from '@/lib/janelasV6';
import { computeBestWindowsForSpot, computeUpcomingWindowsForSpot, indicesRegua } from '@/lib/bestWindowBuild';
import { resolveBestWindowForSport, type ForecastHourRow } from '@/lib/bestWindowToday';
import { loadSpotListings, type SpotListingData } from '@/lib/load-spot-data';
import { manhaSurfV6, melhorManhaV6 } from '@/lib/dawnPatrolV6';
import { getTopNowCards, type HomepageSpotData } from '@/lib/homepageSport';

/**
 * Motor único (#218), PR 5: «Melhor janela» (hoje, 24 h), «Próximas janelas»
 * (48 h) e o Dawn Patrol saem das notas v6 hora a hora — as da régua do spot
 * (`avaliaHoras(horaDeLinha)`) e das frames do `map-hours.json`.
 *
 * Sobre a fixture e2e (`tests/e2e/fixtures/data`: série de 08–14/09, `notaV6`
 * «agora» às 08:00 de 08/09, frame 0 do map-hours às 08:00), com o relógio
 * fixo nessa hora.
 */
const req = createRequire(import.meta.url);
const ROOT = path.join(__dirname, '..', '..', '..');
const FIX = path.join(ROOT, 'tests/e2e/fixtures/data');
const IDS = ['guincho', 'nazare', 'lagoa-albufeira', 'lagos', 'carcavelos', 'supertubos'] as const;
const V6: ReadonlyArray<readonly [SportType & ('kitesurf' | 'surf'), 'kite' | 'surf']> = [
  ['kitesurf', 'kite'],
  ['surf', 'surf'],
];
/** 08:30 de 08/09 em Lisboa (WEST): a hora coberta é a 08:00 do `notaV6` da fixture. */
const NOW = Date.parse('2026-09-08T08:30:00+01:00');

const ler = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const spotDe = (id: string) => (spots as Spot[]).find((s) => s.id === id);
const serieDe = (sp: Spot) => {
  for (const id of [sp.id, sp.conditionsSource].filter(Boolean) as string[]) {
    const f = path.join(FIX, 'forecasts', `${id}.json`);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')) as ForecastHourRow[];
  }
  return [] as ForecastHourRow[];
};
const conditions = ler('conditions.json') as Record<string, Record<string, unknown>>;
const mapHoursFix = ler('map-hours.json') as {
  times: string[];
  spots: Record<string, Record<string, Array<number | null>>>;
};

/** Notas da régua do spot (referência independente: o motor directo), com a hora 0 = `notaV6`. */
function notasRegua(sp: Spot, mod: 'kite' | 'surf', rows: ForecastHourRow[], js: number[], nv: NotaV6Agora | null) {
  const ed = editorialDe(sp);
  const linhas = rows as unknown as LinhaForecast[];
  return js.map((j, k) => {
    if (k === 0 && nv && String(rows[j].time).slice(0, 16) === nv.t) return nv[mod];
    const h = horaDeLinha(linhas, j, { lat: sp.lat, lon: sp.lon, praiaVirada: ed.praiaVirada });
    return avaliaHoras(spotModalidadeDe(ed), mod, [h])[0].n;
  });
}

/** Melhor janela por força bruta (todas as sequências contínuas ≥ 7, ≥ 2 h). */
function janelaBruta(notas: Array<number | null>) {
  let best: { a: number; z: number; score: number } | null = null;
  for (let a = 0; a < notas.length; a++) {
    for (let z = a + 1; z < notas.length; z++) {
      const seg = notas.slice(a, z + 1);
      if (seg.some((n) => n == null || n < 7)) break;
      const antes = a === 0 || notas[a - 1] == null || (notas[a - 1] as number) < 7;
      const depois = z === notas.length - 1 || notas[z + 1] == null || (notas[z + 1] as number) < 7;
      if (!antes || !depois) continue; // só sequências máximas
      const score = Math.floor((seg as number[]).reduce((s, n) => s + n, 0) / seg.length + 1e-9) * 10;
      if (!best || score > best.score || (score === best.score && z - a > best.z - best.a)) best = { a, z, score };
    }
  }
  return best;
}

describe('#218 PR 5 — janelasV6 (regra pura)', () => {
  it('horas contínuas ≥ 7; a noite (null) parte a janela e nunca conta', () => {
    expect(janelasV6([7, 8, null, 9, 9])).toEqual([
      { a: 3, z: 4, nota: 9, score: 90 },
      { a: 0, z: 1, nota: 7, score: 70 },
    ]);
    expect(janelasV6([null, null, null])).toEqual([]);
    expect(JANELA_NOTA_MIN).toBe(7);
  });

  it('«Dá» (5–6) não é janela; mínimo 2 horas', () => {
    expect(janelasV6([6, 6, 6, 6])).toEqual([]);
    expect(janelasV6([4, 8, 4, 7, 7])).toEqual([{ a: 3, z: 4, nota: 7, score: 70 }]);
  });

  it('nota = média para baixo; empate → mais longa → mais cedo; > 24 h partida', () => {
    expect(melhorJanelaV6([9, 8])).toEqual({ a: 0, z: 1, nota: 8, score: 80 });
    expect(melhorJanelaV6([8, 8, 0, 8, 8, 8])).toMatchObject({ a: 3, z: 5 });
    expect(melhorJanelaV6([8, 8, 0, 8, 8])).toMatchObject({ a: 0, z: 1 });
    const longa = janelasV6(Array(30).fill(8));
    expect(longa.map((w) => [w.a, w.z])).toEqual([
      [0, 23],
      [24, 29],
    ]);
  });
});

describe('#218 PR 5 — paridade: janela = notas v6 da régua (48 h, noite excluída)', () => {
  for (const id of IDS) {
    const sp = spotDe(id)!;
    for (const [sport, mod] of V6) {
      it(`${id} × ${sport}: «Próximas janelas» e «hoje» saem das notas da régua`, () => {
        const rows = serieDe(sp);
        const nv = notaV6DoSpot(sp, conditions);
        const js = indicesRegua(rows, 48, NOW);
        // a régua do spot começa na hora coberta (08:00) e tem 48 horas
        expect(js.length).toBe(48);
        expect(String(rows[js[0]].time).slice(0, 16)).toBe('2026-09-08T08:00');
        const notas = notasRegua(sp, mod, rows, js, nv);
        // as notas são as das frames 1.. do map-hours (e a frame 0 = notaV6)
        const serie = mapHoursFix.spots[id]?.[sport];
        if (serie) {
          mapHoursFix.times.forEach((t, k) => {
            const i = js.findIndex((j) => String(rows[j].time).slice(0, 16) === t.slice(0, 16));
            if (i >= 0) expect(serie[k]).toBe(notas[i] == null ? null : notas[i]! * 10);
          });
        }
        expect(notas.some((n) => n == null)).toBe(true); // a fixture tem noites

        const up = computeUpcomingWindowsForSpot(sp, rows, rawToScoreInput(conditions[sp.id] ?? {}), NOW, nv)[sport];
        const esperado = janelaBruta(notas);
        if (!esperado) {
          expect(up).toBeUndefined();
        } else {
          expect(up).toEqual({
            startIso: String(rows[js[esperado.a]].time),
            endIso: String(rows[js[esperado.z]].time),
            score: esperado.score,
          });
          // nenhuma hora da janela é noite nem abaixo de «Bom»
          for (let k = esperado.a; k <= esperado.z; k++) expect(notas[k]).toBeGreaterThanOrEqual(7);
        }

        // «hoje» = mesma regra nas primeiras 24 horas da régua
        const hoje = computeBestWindowsForSpot(sp, rows, NOW, nv).bestWindowsBySport[sport];
        const e24 = janelaBruta(notas.slice(0, 24));
        if (!e24) expect(hoje).toBeUndefined();
        else
          expect(hoje).toEqual({
            start: +String(rows[js[e24.a]].time).slice(11, 13),
            end: +String(rows[js[e24.z]].time).slice(11, 13),
            score: e24.score,
          });
      });
    }
  }

  it('hora 0: vale o notaV6 «agora» (D4), não a previsão crua', () => {
    const sp = spotDe('nazare')!;
    const rows = serieDe(sp);
    const nv = notaV6DoSpot(sp, conditions)!;
    // notaV6 forçado a 9 nas duas primeiras horas? só a hora 0 muda: 9 + previsão da 09:00
    const forte: NotaV6Agora = { ...nv, surf: 9 };
    const js = indicesRegua(rows, 48, NOW);
    const notas = notasRegua(sp, 'surf', rows, js, forte);
    const up = computeUpcomingWindowsForSpot(sp, rows, rawToScoreInput({}), NOW, forte).surf;
    const e = janelaBruta(notas);
    expect(up?.score ?? null).toBe(e?.score ?? null);
    // um notaV6 de outra hora (velho) é ignorado
    const velho: NotaV6Agora = { ...nv, t: '2026-09-07T20:00', surf: 10 };
    const semAgora = notasRegua(sp, 'surf', rows, js, null);
    expect(computeUpcomingWindowsForSpot(sp, rows, rawToScoreInput({}), NOW, velho).surf ?? null).toEqual(
      (() => {
        const b = janelaBruta(semAgora);
        return b ? { startIso: String(rows[js[b.a]].time), endIso: String(rows[js[b.z]].time), score: b.score } : null;
      })(),
    );
  });

  it('janela nunca de noite: série toda ≥ 7 de dia → a janela acaba antes do pôr do sol', () => {
    const sp = spotDe('guincho')!;
    // ondulação de oeste limpa e vento fraco: surf ≥ 7 em todas as horas de dia
    const rows: ForecastHourRow[] = serieDe(sp).map((r) => ({
      ...r,
      waveHeight: 1.8,
      wavePeriod: 13,
      windSpeed: 1,
    }));
    for (const r of rows) (r as unknown as Record<string, unknown>).waveDirection = 290;
    const js = indicesRegua(rows, 48, NOW);
    const notas = notasRegua(sp, 'surf', rows, js, null);
    const up = computeUpcomingWindowsForSpot(sp, rows, rawToScoreInput({}), NOW, null).surf;
    expect(up).toBeDefined();
    const a = js.findIndex((j) => rows[j].time === up!.startIso);
    const z = js.findIndex((j) => rows[j].time === up!.endIso);
    for (let k = a; k <= z; k++) expect(notas[k]).not.toBeNull();
    expect(z + 1 < notas.length ? notas[z + 1] : null).toBeNull(); // parou na noite
    expect(MODALIDADES_DEF.comum.noite).toBeTypeOf('number');
  });
});

describe('#218 PR 5 — bake (loadSpotListings) = janelas v6, todos os spots', () => {
  let tmp = '';
  let bake: SpotListingData[] = [];
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pr5-janelas-'));
    fs.mkdirSync(path.join(tmp, 'public'));
    fs.symlinkSync(FIX, path.join(tmp, 'public', 'data'), 'dir');
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    const agora = vi.spyOn(Date, 'now').mockReturnValue(NOW);
    try {
      bake = loadSpotListings();
    } finally {
      cwd.mockRestore();
      agora.mockRestore();
    }
  }, 180_000);
  afterAll(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('upcomingWindowsBySport / bestWindowsBySport (kite, surf) = régua v6; nenhuma hora de janela é noite', () => {
    const dif: string[] = [];
    let janelas = 0;
    let vistos = 0;
    for (const row of bake) {
      const sp = row.spot as Spot;
      const rows = serieDe(sp);
      if (!rows.length) continue;
      vistos++;
      const nv = notaV6DoSpot(sp, conditions);
      const js = indicesRegua(rows, 48, NOW);
      for (const [sport, mod] of V6) {
        if (!(sp.compatibleSports ?? []).includes(sport)) continue;
        const notas = notasRegua(sp, mod, rows, js, nv);
        const e = janelaBruta(notas);
        const got = row.upcomingWindowsBySport[sport];
        const want = e ? { startIso: String(rows[js[e.a]].time), endIso: String(rows[js[e.z]].time), score: e.score } : undefined;
        if (JSON.stringify(got) !== JSON.stringify(want)) dif.push(`${sp.id} ${sport} 48h`);
        if (e) {
          janelas++;
          for (let k = e.a; k <= e.z; k++) if (notas[k] == null) dif.push(`${sp.id} ${sport} noite`);
        }
        const e24 = janelaBruta(notas.slice(0, 24));
        const g24 = row.bestWindowsBySport[sport];
        const w24 = e24
          ? { start: +String(rows[js[e24.a]].time).slice(11, 13), end: +String(rows[js[e24.z]].time).slice(11, 13), score: e24.score }
          : undefined;
        if (JSON.stringify(g24) !== JSON.stringify(w24)) dif.push(`${sp.id} ${sport} 24h`);
      }
    }
    expect(vistos).toBeGreaterThan(150);
    expect(janelas).toBeGreaterThan(0);
    expect(dif).toEqual([]);
  });
});

describe('#218 PR 5 — Dawn Patrol: nota da manhã = nota da régua às 06–11 h', () => {
  const dp = req('../../../scripts/dawn-patrol.js') as {
    morningSpotV6: (...a: unknown[]) => Record<string, unknown> | null;
    generateBasicAdvice: (...a: unknown[]) => { spots: Array<{ slug: string; verdict: string; score: number }> };
  };
  const v6 = { manhaSurfV6, melhorManhaV6 };
  const ANTES = Date.parse('2026-09-08T04:00:00+01:00'); // run das 04:00

  for (const id of ['guincho', 'nazare', 'carcavelos', 'arrifana'] as const) {
    it(`${id}: horas 06–11 = avaliaHoras(horaDeLinha); a noite nunca é a melhor`, () => {
      const sp = spotDe(id)!;
      expect(sp).toBeDefined();
      const rows = serieDe(sp) as unknown as LinhaForecast[];
      const horas = manhaSurfV6(sp, rows, ANTES);
      expect(horas.map((h) => h.hour)).toEqual([6, 7, 8, 9, 10, 11]);
      const ed = editorialDe(sp);
      for (const h of horas) {
        expect(h.t.slice(0, 13)).toBe(`2026-09-08T${String(h.hour).padStart(2, '0')}`);
        const hs = horaDeLinha(rows, h.j, { lat: sp.lat, lon: sp.lon, praiaVirada: ed.praiaVirada });
        expect(h.nota).toBe(avaliaHoras(spotModalidadeDe(ed), 'surf', [hs])[0].n);
      }
      expect(horas[0].nota).toBeNull(); // 06h de setembro: noite
      const best = melhorManhaV6(horas);
      const max = Math.max(...horas.filter((h) => h.nota != null).map((h) => h.nota!));
      expect(best?.nota).toBe(max);
      expect(best?.hour).toBe(horas.find((h) => h.nota === max)!.hour);

      const top = { name: sp.name, slug: sp.slug, region: sp.region, type: sp.type };
      const e = dp.morningSpotV6(top, sp, rows, ANTES, v6)!;
      expect(e.score).toBe(max * 10);
      expect(e.scoreForecast).toBe(max * 10);
      expect(e.scoreSource).toBe('previsão');
      expect((e.bestWindow as { hour: number }).hour).toBe(best!.hour);
    });
  }

  it('horas já passadas (e a corrente) vão para amanhã; tudo noite → sem entrada', () => {
    const sp = spotDe('guincho')!;
    const rows = serieDe(sp) as unknown as LinhaForecast[];
    const AS8 = Date.parse('2026-09-08T08:20:00+01:00');
    const horas = manhaSurfV6(sp, rows, AS8);
    expect(horas.find((h) => h.hour === 8)?.t.slice(0, 10)).toBe('2026-09-09');
    expect(horas.find((h) => h.hour === 9)?.t.slice(0, 10)).toBe('2026-09-08');
    const top = { name: 'Guincho', slug: 'guincho', region: 'Cascais', type: 'surf' };
    const so6 = rows.filter((r) => /T0[0-6]:/.test(String(r.time)));
    expect(dp.morningSpotV6(top, sp, so6, ANTES, v6)).toBeNull();
  });

  it('veredicto sobre a nota v6: go = Bom (≥ 7), maybe = Dá (5–6), skip abaixo', () => {
    const mk = (slug: string, score: number) => ({
      name: slug,
      slug,
      region: 'x',
      score,
      bestWindow: { hour: 9, waveHeight: 1.5, wavePeriod: 10, windSpeed: 3, waterTemp: 18, score },
    });
    const out = dp.generateBasicAdvice([mk('a', 70), mk('b', 60), mk('c', 40)], new Map(), new Map());
    expect(Object.fromEntries(out.spots.map((s) => [s.slug, s.verdict]))).toEqual({ a: 'go', b: 'maybe', c: 'skip' });
  });
});

describe('#218 PR 5 — filtros e ordem', () => {
  it('resolveBestWindowForSport: desporto sem janela → null (nunca a janela de outro desporto)', () => {
    const today = { start: 10, end: 14, score: 78, sport: 'windsurf' as SportType };
    expect(resolveBestWindowForSport(today, { windsurf: { start: 10, end: 14, score: 78 } }, 'kitesurf')).toBeNull();
    expect(resolveBestWindowForSport(today, { kitesurf: { start: 15, end: 18, score: 80 } }, 'kitesurf')).toEqual({
      start: 15,
      end: 18,
      score: 80,
      sport: 'kitesurf',
    });
    expect(resolveBestWindowForSport(today, {}, 'all')).toEqual(today);
  });

  it('«A bombar agora» ordena pela nota inteira: windsurf 73 (7) não passa à frente de surf 70 (7)', () => {
    const mk = (slug: string, sport: SportType, score: number): HomepageSpotData =>
      ({
        spot: { id: slug, slug, name: slug, compatibleSports: [sport], type: 'surf', lat: 38.7, lon: -9.4 },
        allScores: { [sport]: { score } },
        conditions: {},
        bestWindowToday: null,
        bestWindowsBySport: {},
        upcomingWindowsBySport: {},
      }) as unknown as HomepageSpotData;
    const cards = getTopNowCards([mk('zz-windsurf', 'windsurf', 73), mk('aa-surf', 'surf', 70)], 'all');
    expect(cards.map((c) => c.data.spot.slug)).toEqual(['aa-surf', 'zz-windsurf']);
    const s = getTopNowCards([mk('b', 'surf', 74), mk('a', 'surf', 70), mk('c', 'surf', 80)], 'surf');
    expect(s.map((c) => c.data.spot.slug)).toEqual(['c', 'a', 'b']);
  });
});
