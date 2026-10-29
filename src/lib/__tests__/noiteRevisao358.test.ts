import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spots } from '@/lib/spots';
import type { Spot } from '@/types';
import type { ForecastHourRow, UpcomingWindow } from '@/lib/bestWindowToday';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import { rawToScoreInput } from '@/lib/scoreConditions';
import { notaV6DoSpot, sportScoreDeNotaV6, type NotaV6Agora } from '@/lib/notaV6Agora';
import { seriesTimeMs } from '@/lib/openMeteoTime';
import {
  computeJanelasCandidatasForSpot,
  computeUpcomingWindowsForSpot,
  janelasNoiteExtra,
} from '@/lib/bestWindowBuild';
import {
  compararNoite,
  desvioSpotMin,
  diasAte,
  horasAte,
  janelaSeguinte,
  janelaViva,
  veredictoComparador,
  veredictoNoite,
  type JanelaSeguinte,
} from '@/lib/noiteListas';
import { carregarFavoritos } from '@/components/favorites/carregarFavoritos';

/** Revisão do Pedro ao PR #358 (28/10): os 4 achados, um bloco cada. */
const W = (startIso: string, endIso: string, score: number): UpcomingWindow => ({ startIso, endIso, score });
const spotDe = (id: string) => (spots as Spot[]).find((s) => s.id === id)!;

describe('1 · fuso do spot: janela viva, dias e 24 h em instantes UTC (Açores −01:00)', () => {
  // 00:30 UTC de 29/10 = 00:30 em Lisboa (WET) = 23:30 de 28/10 nos Açores
  const AGORA = Date.parse('2026-10-29T00:30:00Z');

  it('às 00:30 UTC de 29/10, uma janela dos Açores que acaba 2026-10-28T23:00-01:00 ainda está viva', () => {
    const w = W('2026-10-28T21:00-01:00', '2026-10-28T23:00-01:00', 80);
    // a última hora boa começa às 00:00 UTC e acaba às 01:00 UTC
    expect(janelaViva(w, AGORA)).toBe(true);
    expect(janelaViva(w, Date.parse('2026-10-29T01:00:00Z'))).toBe(false);
    // no continente, a mesma etiqueta de parede (sem desvio = Lisboa) já acabou
    expect(janelaViva(W('2026-10-28T21:00', '2026-10-28T23:00', 80), AGORA)).toBe(false);
  });

  it('dias («hoje» / «amanhã») no fuso do spot', () => {
    expect(desvioSpotMin('2026-10-29T08:00-01:00')).toBe(-60);
    expect(desvioSpotMin('2026-10-29T08:00+00:00')).toBe(0);
    expect(desvioSpotMin('2026-07-29T08:00')).toBe(60); // Lisboa no verão
    // nos Açores ainda é dia 28: uma janela no dia 29 é «amanhã»
    expect(diasAte('2026-10-29T08:00-01:00', AGORA)).toBe(1);
    // em Lisboa já é dia 29: a mesma data é «hoje»
    expect(diasAte('2026-10-29T08:00+00:00', AGORA)).toBe(0);
    expect(diasAte('2026-10-29T08:00', AGORA)).toBe(0);
  });

  it('horasAte e o corte das 24 h com instantes (o desvio conta)', () => {
    expect(horasAte('2026-10-29T08:00-01:00', AGORA)).toBeCloseTo(8.5);
    expect(horasAte('2026-10-29T08:00+00:00', AGORA)).toBeCloseTo(7.5);
    const az = { spot: spotDe('guincho'), janelasNoiteBySport: { surf: [W('2026-10-29T23:00-01:00', '2026-10-30T01:00-01:00', 80)] } };
    // começa às 00:00 UTC de 30/10 = 23,5 h depois → dentro das 24 h, fora das 23
    expect(janelaSeguinte(az, 'surf', AGORA, 24)?.w.score).toBe(80);
    expect(janelaSeguinte(az, 'surf', AGORA, 23)).toBeNull();
  });
});

describe('2 · janelas candidatas: a PRÓXIMA (dia → nota → início), não só a de melhor nota', () => {
  const NOITE = Date.parse('2026-10-28T22:00:00Z');
  const amanha7 = W('2026-10-29T08:00', '2026-10-29T11:00', 70);
  const depois9 = W('2026-10-30T09:00', '2026-10-30T12:00', 90);

  it('um 7 amanhã às 08h ganha a um 9 depois de amanhã (o 9 é a melhor nota do bake)', () => {
    const row = { spot: spotDe('guincho'), upcomingWindowsBySport: { surf: depois9 }, janelasNoiteBySport: { surf: [amanha7] } };
    expect(janelaSeguinte(row, 'surf', NOITE)).toMatchObject({ w: amanha7, dia: 1 });
    // sem as candidatas (o bug): só o 9 de depois de amanhã
    expect(janelaSeguinte({ ...row, janelasNoiteBySport: undefined }, 'surf', NOITE)?.w).toBe(depois9);
    // a candidata que já acabou sai; fica a seguinte
    const passou = { ...row, janelasNoiteBySport: { surf: [W('2026-10-28T15:00', '2026-10-28T17:00', 80), amanha7] } };
    expect(janelaSeguinte(passou, 'surf', NOITE)?.w).toBe(amanha7);
  });

  it('a ordem das listas de noite usa a próxima candidata', () => {
    const base = spotDe('guincho');
    const linha = (id: string, up: UpcomingWindow, outras: UpcomingWindow[] = []) =>
      ({
        spot: { ...base, id, slug: id },
        allScores: { surf: sportScoreDeNotaV6({ t: 'x', kite: null, surf: null }, 'surf') },
        upcomingWindowsBySport: { surf: up },
        janelasNoiteBySport: outras.length ? { surf: outras } : undefined,
      }) as unknown as GridSpotData;
    const a = linha('a', depois9, [amanha7]);
    const b = linha('b', W('2026-10-29T13:00', '2026-10-29T15:00', 70));
    // os dois amanhã com 7: decide o início (08h antes de 13h); sem a candidata, A ia para depois
    expect(compararNoite(a, b, 'surf', NOITE)).toBeLessThan(0);
    expect(compararNoite({ ...a, janelasNoiteBySport: undefined }, b, 'surf', NOITE)).toBeGreaterThan(0);
  });

  it('o «Amanhã ganha» do comparador vê todas as candidatas das 24 h', () => {
    type Item = { n: string; j: JanelaSeguinte | null; j24: JanelaSeguinte | null };
    const J = (w: UpcomingWindow): JanelaSeguinte => ({ sport: 'surf', w, dia: diasAte(w.startIso, NOITE) });
    // A: próxima = 7 amanhã às 07h, mas tem um 8 amanhã às 09h dentro das 24 h; B: 7 amanhã às 08h
    const a: Item = { n: 'A', j: J(W('2026-10-29T07:00', '2026-10-29T08:00', 70)), j24: J(W('2026-10-29T09:00', '2026-10-29T11:00', 80)) };
    const b: Item = { n: 'B', j: J(amanha7), j24: J(amanha7) };
    const v = veredictoNoite([b, a], (x) => x.j, (x) => x.n, NOITE, 'pt', (x) => x.j24);
    expect(v.ganham24h.map((x) => x.n)).toEqual(['A', 'B']);
    // janelaSeguinte(…, 24) sobre as candidatas da linha: a próxima (9 amanhã às 22:30) começa
    // depois das 24 h, mas o 7 das 08h está dentro → conta para o «Amanhã ganha»
    const tarde9 = W('2026-10-29T22:30', '2026-10-30T00:00', 90);
    const row = { spot: spotDe('guincho'), upcomingWindowsBySport: { surf: tarde9 }, janelasNoiteBySport: { surf: [amanha7] } };
    expect(janelaSeguinte(row, 'surf', NOITE)?.w).toBe(tarde9);
    expect(janelaSeguinte(row, 'surf', NOITE, 24)?.w).toBe(amanha7);
    // só com a melhor (o bug): ninguém nas 24 h
    expect(janelaSeguinte({ ...row, janelasNoiteBySport: undefined }, 'surf', NOITE, 24)).toBeNull();
  });

  it('computeJanelasCandidatasForSpot (fixture e2e): todas ≥ Bom por ordem de início, a melhor incluída; o bake só leva as outras', () => {
    const FIX = path.join(__dirname, '..', '..', '..', 'tests/e2e/fixtures/data');
    const conditions = JSON.parse(fs.readFileSync(path.join(FIX, 'conditions.json'), 'utf8')) as Record<string, Record<string, unknown>>;
    const NOW = Date.parse('2026-09-08T07:30:00Z');
    let algumaComOutras = false;
    for (const sp of spots as Spot[]) {
      const f = path.join(FIX, 'forecasts', `${sp.conditionsSource ?? sp.id}.json`);
      if (!fs.existsSync(f)) continue;
      const rows = JSON.parse(fs.readFileSync(f, 'utf8')) as ForecastHourRow[];
      const input = rawToScoreInput(conditions[sp.id] ?? {});
      const nv: NotaV6Agora | null = notaV6DoSpot(sp, conditions);
      const up = computeUpcomingWindowsForSpot(sp, rows, input, NOW, nv);
      const cands = computeJanelasCandidatasForSpot(sp, rows, input, NOW, nv);
      for (const [sport, best] of Object.entries(up)) {
        const cs = cands[sport as keyof typeof cands] ?? [];
        const inicios = cs.map((w) => seriesTimeMs(w.startIso));
        expect([...inicios].sort((x, y) => x - y)).toEqual(inicios);
        if (['surf', 'kitesurf', 'windsurf', 'bodyboard', 'foil'].includes(sport)) {
          expect(cs.some((w) => w.startIso === best!.startIso && w.endIso === best!.endIso)).toBe(true);
          for (const w of cs) expect(w.score).toBeGreaterThanOrEqual(70);
        }
      }
      const extra = janelasNoiteExtra(cands, up);
      if (extra) {
        algumaComOutras = true;
        for (const [sport, ws] of Object.entries(extra)) {
          const b = up[sport as keyof typeof up];
          for (const w of ws!) expect(b && w.startIso === b.startIso && w.endIso === b.endIso).toBeFalsy();
        }
      }
    }
    expect(algumaComOutras).toBe(true);
  });

  it('janelasNoiteExtra: sem outras → undefined (a linha do bake não ganha a chave)', () => {
    expect(janelasNoiteExtra({ surf: [depois9] }, { surf: depois9 })).toBeUndefined();
    expect(janelasNoiteExtra({ surf: [amanha7, depois9] }, { surf: depois9 })).toEqual({ surf: [amanha7] });
  });
});

describe('3 · comparador misto (um de noite, um de dia a 0)', () => {
  type It = { n: string; noite: boolean; score: number; j: JanelaSeguinte | null };
  const J = (start: string, score: number): JanelaSeguinte => ({ sport: 'surf', w: W(start, start, score), dia: 1 });
  const NOW = Date.parse('2026-10-28T22:00:00Z');
  const base = { noite: (x: It) => x.noite, score: (x: It) => x.score, janelaDe: (x: It) => x.j, nome: (x: It) => x.n, locale: 'pt' };

  it('a lua primeiro em ?spots= não ganha: o de dia vem à frente, sem cartão de vencedor com N/A 0/10', () => {
    const noite: It = { n: 'Ponta Delgada', noite: true, score: 0, j: J('2026-10-29T09:00', 80) };
    const dia: It = { n: 'Guincho', noite: false, score: 0, j: null };
    const v = veredictoComparador([noite, dia], { ...base, nowMs: NOW });
    expect(v.modo).toBe('misto');
    expect(v.ordem.map((x) => x.n)).toEqual(['Guincho', 'Ponta Delgada']);
    // ninguém de dia com nota > 0: sem vencedor normal; vale a janela («Amanhã ganha Ponta Delgada»)
    expect(v.vencedorDia).toBeNull();
    expect(v.ganham24h.map((x) => x.n)).toEqual(['Ponta Delgada']);
  });

  it('um de dia com nota > 0 ganha normalmente; a entrada de noite nunca é vencedora', () => {
    const noite: It = { n: 'Ponta Delgada', noite: true, score: 0, j: J('2026-10-29T09:00', 90) };
    const dia: It = { n: 'Guincho', noite: false, score: 40, j: null };
    const v = veredictoComparador([noite, dia], { ...base, nowMs: NOW });
    expect(v.vencedorDia?.n).toBe('Guincho');
    expect(v.ganham24h).toEqual([]);
  });

  it('sem janelas ainda (nowMs null): nem vencedor nem «Amanhã ganha»; só de dia / só de noite como antes', () => {
    const noite: It = { n: 'A', noite: true, score: 0, j: null };
    const dia: It = { n: 'B', noite: false, score: 0, j: null };
    const v = veredictoComparador([noite, dia], { ...base, nowMs: null });
    expect(v.vencedorDia).toBeNull();
    expect(v.ganham24h).toEqual([]);
    const soDia = veredictoComparador([dia, { ...dia, n: 'C', score: 60 }], { ...base, nowMs: null });
    expect(soDia.modo).toBe('dia');
    expect(soDia.vencedorDia?.n).toBe('C');
    expect(veredictoComparador([noite, { ...noite, n: 'D' }], { ...base, nowMs: NOW }).modo).toBe('noite');
  });
});

describe('4 · favoritos: as janelas de noite resolvem-se também com o fallback live', () => {
  const NV_NOITE = { t: '2026-10-28T22:00', kite: null, surf: null, windsurf: null, bodyboard: null, foil: null };
  const guincho = spotDe('guincho');
  const marine = async () => ({ waveHeight: 1, wavePeriod: 8, waveDirection: 300, windSpeed: 3, windDirection: 0, windGust: 4, waterTemp: 16 });

  it('um favorito sem entrada no conditions.json não apaga as janelas dos que estão de noite', async () => {
    const janelasDeNoite = vi.fn(async () => ({ surf: [W('2026-10-29T08:00', '2026-10-29T11:00', 80)] }));
    const r = await carregarFavoritos(['guincho', 'nazare'], spots as Spot[], {
      // a Nazaré não vem no ficheiro → fallback live
      conditionsJson: async () => ({ guincho: { waveHeight: 1.2, wavePeriod: 10, windSpeed: 3, notaV6: NV_NOITE } }),
      marine,
      janelasDeNoite,
      nowMs: Date.parse('2026-10-28T22:00:00Z'),
    });
    expect(r.conditions.nazare).toBeDefined();
    expect(janelasDeNoite).toHaveBeenCalledTimes(1);
    expect(r.janelas?.porSpot.guincho?.surf?.[0].score).toBe(80);
    expect(janelaSeguinte({ spot: guincho, janelasNoiteBySport: r.janelas!.porSpot.guincho }, 'surf', r.janelas!.nowMs)).not.toBeNull();
    expect(r.janelas?.porSpot.nazare).toBeUndefined();
  });

  it('cada carregamento devolve o estado inteiro (sem noite → janelas null, nunca as do fetch anterior)', async () => {
    const r = await carregarFavoritos(['guincho'], spots as Spot[], {
      conditionsJson: async () => ({ guincho: { waveHeight: 1.2, wavePeriod: 10, windSpeed: 3 } }),
      marine,
      janelasDeNoite: async () => ({}),
      nowMs: 0,
    });
    expect(r.janelas).toBeNull();
    // conditions.json em falta: tudo pelo fallback, sem rebentar
    const r2 = await carregarFavoritos(['guincho'], spots as Spot[], {
      conditionsJson: async () => {
        throw new Error('offline');
      },
      marine,
      janelasDeNoite: async () => ({}),
      nowMs: 0,
    });
    expect(r2.conditions.guincho).toBeDefined();
    expect(r2.janelas).toBeNull();
  });
});
