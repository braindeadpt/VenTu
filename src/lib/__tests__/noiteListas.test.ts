import { describe, expect, it } from 'vitest';
import { spots } from '@/lib/spots';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import type { UpcomingWindow } from '@/lib/bestWindowToday';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import type { HomepageSpotData } from '@/lib/homepageSport';
import {
  allScoresComV6,
  isNoite,
  isSemDados,
  notaV6EhNoite,
  scoreAgoraComV6,
  scoresMotorAntigo,
  sportScoreDeNotaV6,
  type NotaV6Agora,
} from '@/lib/notaV6Agora';
import { getSportScore, type Conditions } from '@/lib/sportScore';
import { refreshGridSpotScores } from '@/lib/refreshGridSpotScores';
import {
  compararJanelas,
  diasAte,
  janelaSeguinte,
  linhaDeNoite,
  listaDeNoite,
  relogioLisboa,
  veredictoNoite,
  type JanelaSeguinte,
} from '@/lib/noiteListas';
import { compareRanking } from '@/components/spots/spotGridSelectors';
import { getGridSpotScore } from '@/lib/gridSpotScore';
import { compareHomeRanked } from '@/components/homepage/HomepageRankedSection';

const spotDe = (id: string) => (spots as Spot[]).find((s) => s.id === id)!;
const KN = 1.94384;
// qua 28/10/2026, 22:00 em Lisboa (WET, UTC+0)
const NOITE = Date.parse('2026-10-28T22:00:00Z');
const NV_NOITE: NotaV6Agora = { t: '2026-10-28T22:00', kite: null, surf: null, windsurf: null, bodyboard: null, foil: null };
const NV_DIA: NotaV6Agora = { t: '2026-10-28T13:00', kite: 3, surf: 6, windsurf: 2, bodyboard: 5, foil: 4 };
// mar plano e vento fraco: o motor antigo dá nota de SUP / wake de dia (o «4» do embed)
const CALMO: Conditions = {
  waveHeight: 0.3,
  wavePeriod: 6,
  waveDirection: 300,
  windSpeed: 4 / KN,
  windDirection: 20,
  windGust: 6 / KN,
  waterTemp: 17,
};

describe('isNoite / notaV6EhNoite', () => {
  it('a marca noite do notaV6 vira isNoite; sem dados não é noite', () => {
    expect(isNoite(sportScoreDeNotaV6(NV_NOITE, 'surf'))).toBe(true);
    expect(isNoite(sportScoreDeNotaV6(NV_DIA, 'surf'))).toBe(false);
    const sem: NotaV6Agora = { ...NV_DIA, surf: null, sem: ['surf'] };
    expect(isNoite(sportScoreDeNotaV6(sem, 'surf'))).toBe(false);
    expect(isSemDados(sportScoreDeNotaV6(sem, 'surf'))).toBe(true);
    expect(isNoite(null)).toBe(false);
    expect(isNoite({ score: 0 })).toBe(false);
  });

  it('noite = as cinco v6 sem nota e pelo menos uma sem ser por falta de dados', () => {
    expect(notaV6EhNoite(NV_NOITE)).toBe(true);
    expect(notaV6EhNoite({ ...NV_NOITE, sem: ['surf', 'bodyboard'] })).toBe(true);
    expect(notaV6EhNoite(NV_DIA)).toBe(false);
    // tudo sem dados: não é noite
    expect(notaV6EhNoite({ ...NV_NOITE, sem: ['kite', 'surf', 'windsurf', 'bodyboard', 'foil'] })).toBe(false);
    // uma modalidade com nota: é dia
    expect(notaV6EhNoite({ ...NV_NOITE, kite: 4 })).toBe(false);
    expect(notaV6EhNoite(null)).toBe(false);
  });
});

describe('corte de noite no SUP e no wakeboard (motor antigo)', () => {
  const spot = spotDe('lagoa-obidos') ?? spots.find((s) => s.compatibleSports?.includes('sup'))!;

  it('de dia o motor antigo fica igual', () => {
    const m = scoresMotorAntigo(spot, CALMO, NV_DIA);
    expect(m.sup).toEqual(getSportScore(spot, 'sup', CALMO));
    expect(m.wakeboard).toEqual(getSportScore(spot, 'wakeboard', CALMO));
    expect(scoresMotorAntigo(spot, CALMO)).toEqual({ sup: getSportScore(spot, 'sup', CALMO), wakeboard: getSportScore(spot, 'wakeboard', CALMO) });
  });

  it('com o notaV6 de noite, SUP e wake ficam noite (score 0, N/A), nunca a nota de dia', () => {
    expect(getSportScore(spot, 'sup', CALMO).score).toBeGreaterThan(0);
    const all = allScoresComV6(spot, CALMO, NV_NOITE);
    for (const s of ['sup', 'wakeboard', 'surf', 'kitesurf'] as SportType[]) {
      expect(isNoite(all[s]), s).toBe(true);
      expect(all[s].score).toBe(0);
      expect(all[s].rating).toBe('N/A');
    }
    expect(isNoite(scoreAgoraComV6(spot, 'sup', CALMO, NV_NOITE))).toBe(true);
    expect(scoreAgoraComV6(spot, 'sup', CALMO, NV_DIA)).toEqual(getSportScore(spot, 'sup', CALMO));
    // sem notaV6 (Open-Meteo ao vivo) não há como saber: motor antigo
    expect(isNoite(scoreAgoraComV6(spot, 'sup', CALMO, null))).toBe(false);
  });

  it('o refresh do cliente aplica o mesmo corte (o máximo do embed / «Todos» nunca é de dia)', () => {
    const row = {
      spot,
      conditions: { ...CALMO },
      allScores: allScoresComV6(spot, CALMO, NV_DIA),
      bestWindowToday: null,
      bestWindowsBySport: {},
    } as unknown as GridSpotData;
    const cond = { [spot.id]: { ...CALMO, notaV6: NV_NOITE } };
    const [out] = refreshGridSpotScores([row], cond);
    expect(isNoite(out.allScores.sup)).toBe(true);
    expect(isNoite(out.allScores.wakeboard)).toBe(true);
    expect(Math.max(...Object.values(out.allScores).map((s) => s.score))).toBe(0);
  });
});

const W = (startIso: string, endIso: string, score: number): UpcomingWindow => ({ startIso, endIso, score });
const J = (startIso: string, endIso: string, score: number, sport: SportType = 'surf'): JanelaSeguinte => ({
  sport,
  w: W(startIso, endIso, score),
  dia: diasAte(startIso, NOITE),
});

describe('relógio de Lisboa e dias', () => {
  it('lê a parede de Lisboa e conta dias de calendário', () => {
    expect(relogioLisboa(NOITE)).toBe('2026-10-28T22:00');
    expect(relogioLisboa(Date.parse('2026-07-01T22:30:00Z'))).toBe('2026-07-01T23:30');
    expect(diasAte('2026-10-29T07:00', NOITE)).toBe(1);
    expect(diasAte('2026-10-30T08:00', NOITE)).toBe(2);
    expect(diasAte('2026-10-28T23:00', NOITE)).toBe(0);
  });
});

describe('ordem de noite (regra aprovada 28/10): dia, nota, início, sem janela no fim', () => {
  it('o DIA ganha à nota: amanhã 7 antes de sexta 9', () => {
    const amanha7 = J('2026-10-29T10:00', '2026-10-29T12:00', 70);
    const sexta9 = J('2026-10-30T08:00', '2026-10-30T11:00', 90);
    expect(compararJanelas(amanha7, sexta9)).toBeLessThan(0);
    expect(compararJanelas(sexta9, amanha7)).toBeGreaterThan(0);
  });

  it('no mesmo dia, a nota (alta → baixa); depois o início mais cedo', () => {
    const a9 = J('2026-10-29T07:00', '2026-10-29T10:00', 90);
    const a8cedo = J('2026-10-29T07:00', '2026-10-29T11:00', 80);
    const a8tarde = J('2026-10-29T09:00', '2026-10-29T13:00', 84);
    expect(compararJanelas(a9, a8cedo)).toBeLessThan(0);
    // 80 e 84 são ambos «8»: decide a hora
    expect(compararJanelas(a8cedo, a8tarde)).toBeLessThan(0);
    expect(compararJanelas(a8cedo, J('2026-10-29T07:00', '2026-10-29T08:00', 78))).toBe(0);
  });

  it('sem janela fica no fim', () => {
    expect(compararJanelas(null, J('2026-10-31T08:00', '2026-10-31T09:00', 70))).toBeGreaterThan(0);
    expect(compararJanelas(null, null)).toBe(0);
  });
});

function linha(id: string, nome: string, janelas: Partial<Record<SportType, UpcomingWindow>>, noite = true): GridSpotData {
  const base = spotDe('guincho');
  const spot = { ...base, id, slug: id, name: nome, nameEn: nome };
  const nv = noite ? NV_NOITE : NV_DIA;
  return {
    spot,
    conditions: { ...CALMO },
    allScores: allScoresComV6(spot, CALMO, nv),
    bestWindowToday: null,
    bestWindowsBySport: {},
    upcomingWindowsBySport: janelas,
  } as unknown as GridSpotData;
}

describe('linhas e listas de noite', () => {
  it('linhaDeNoite / listaDeNoite (no crepúsculo a lista fica de dia)', () => {
    const n = linha('n', 'Noite', {});
    const d = linha('d', 'Dia', {}, false);
    expect(linhaDeNoite(n, 'surf')).toBe(true);
    expect(linhaDeNoite(n, 'all')).toBe(true);
    expect(linhaDeNoite(n, 'big-wave')).toBe(true);
    expect(linhaDeNoite(d, 'surf')).toBe(false);
    expect(listaDeNoite([n], 'surf')).toBe(true);
    expect(listaDeNoite([n, d], 'surf')).toBe(false);
    expect(listaDeNoite([], 'surf')).toBe(false);
  });

  it('janelaSeguinte: tira as que já acabaram; com «Todos» ganha a da regra', () => {
    const r = linha('g', 'Guincho', {
      surf: W('2026-10-30T08:00', '2026-10-30T10:00', 90),
      kitesurf: W('2026-10-29T14:00', '2026-10-29T17:00', 70),
    });
    expect(janelaSeguinte(r, 'surf', NOITE)?.w.score).toBe(90);
    expect(janelaSeguinte(r, 'all', NOITE)).toMatchObject({ sport: 'kitesurf', dia: 1 });
    const acabou = linha('x', 'X', { surf: W('2026-10-28T15:00', '2026-10-28T17:00', 80) });
    expect(janelaSeguinte(acabou, 'surf', NOITE)).toBeNull();
    expect(janelaSeguinte(acabou, 'surf', null)?.w.score).toBe(80);
    // desporto que o spot não tem: sem janela
    expect(janelaSeguinte(r, 'wakeboard', NOITE)).toBeNull();
  });

  it('compareRanking (/spots) e compareHomeRanked (Top 8): dia antes da nota, sem janela no fim por nome', () => {
    const rows = [
      linha('z-sem', 'Zambujeira', {}),
      linha('a-sem', 'Adraga', {}),
      linha('sexta9', 'Arrifana', { surf: W('2026-10-30T08:00', '2026-10-30T11:00', 90) }),
      linha('amanha7', 'Carcavelos', { surf: W('2026-10-29T10:00', '2026-10-29T12:00', 70) }),
      linha('amanha8-9h', 'Nazaré', { surf: W('2026-10-29T09:00', '2026-10-29T13:00', 80) }),
      linha('amanha8-7h', 'Ribeira', { surf: W('2026-10-29T07:00', '2026-10-29T11:00', 80) }),
      linha('amanha8-7h-b', 'Guincho', { surf: W('2026-10-29T07:00', '2026-10-29T11:00', 80) }),
    ];
    const esperado = ['amanha8-7h-b', 'amanha8-7h', 'amanha8-9h', 'amanha7', 'sexta9', 'a-sem', 'z-sem'];
    const s1 = [...rows].sort((a, b) => compareRanking(a, b, 'surf', 'pt', NOITE)).map((r) => r.spot.id);
    const s2 = [...rows].reverse().sort((a, b) => compareRanking(a, b, 'surf', 'pt', NOITE)).map((r) => r.spot.id);
    expect(s1).toEqual(esperado);
    expect(s2).toEqual(esperado);
    const h = [...rows]
      .sort((a, b) => compareHomeRanked(a as unknown as HomepageSpotData, b as unknown as HomepageSpotData, 'surf', 'pt', NOITE))
      .map((r) => r.spot.id);
    expect(h).toEqual(esperado);
  });

  it('linhas de dia à frente das de noite; de dia a ordem é a de sempre', () => {
    const dia = linha('dia', 'Zulu', {}, false);
    const noite = linha('noite', 'Alfa', { surf: W('2026-10-29T07:00', '2026-10-29T11:00', 90) });
    expect(compareRanking(dia, noite, 'surf', 'pt', NOITE)).toBeLessThan(0);
    const d2 = linha('d2', 'Beta', {}, false);
    // dois de dia: nota igual → nome
    expect(compareRanking(d2, dia, 'surf', 'pt', NOITE)).toBeLessThan(0);
  });
});

/** Linha de dia com um `notaV6` à escolha (nota 0 de dia ≠ noite). */
function linhaDia(id: string, nome: string, nv: NotaV6Agora): GridSpotData {
  const r = linha(id, nome, {}, false);
  return { ...r, allScores: allScoresComV6(r.spot as Spot, CALMO, nv) } as GridSpotData;
}

describe('listas mistas (continente de dia, Açores ainda de noite)', () => {
  const NV_KITE0: NotaV6Agora = { ...NV_DIA, kite: 0 };
  const NV_KITE3: NotaV6Agora = { ...NV_DIA, kite: 3 };
  const amanha = { kitesurf: W('2026-10-29T07:00', '2026-10-29T11:00', 80), surf: W('2026-10-29T08:00', '2026-10-29T10:00', 70) };

  it('linhas de dia com nota 0 não põem a lista de noite', () => {
    const rows = [linhaDia('d0', 'Cova do Vapor', NV_KITE0), linha('az', 'Anjos', amanha)];
    expect(linhaDeNoite(rows[0], 'kitesurf')).toBe(false);
    expect(listaDeNoite(rows, 'kitesurf')).toBe(false);
    expect(listaDeNoite(rows, 'surf')).toBe(false);
    expect(listaDeNoite(rows, 'all')).toBe(false);
    // só noite → lista de noite; uma de dia (mesmo com 0) → de dia
    expect(listaDeNoite([rows[1], linha('az2', 'Mosteiros', {})], 'kitesurf')).toBe(true);
    expect(listaDeNoite([rows[1], linha('az2', 'Mosteiros', {}), rows[0]], 'kitesurf')).toBe(false);
  });

  it('linhas sem dados não contam (nem dia nem noite)', () => {
    const sem = linhaDia('sem', 'Sem dados', { ...NV_DIA, kite: null, sem: ['kite'] });
    expect(listaDeNoite([linha('az', 'Anjos', amanha), sem], 'kitesurf')).toBe(true);
    expect(listaDeNoite([sem], 'kitesurf')).toBe(false);
  });

  it('página de modalidade (kitesurf, 13h): dia por nota com as notas intactas, noite no fim', () => {
    const rows = [
      linha('az-anjos', 'Anjos', amanha),
      linhaDia('alvor', 'Alvor', NV_KITE0),
      linhaDia('vrsa', 'Vila Real de Santo António', NV_KITE3),
      linha('az-agua', 'Água d\'Alto', {}),
      linhaDia('cova', 'Cova do Vapor', NV_KITE3),
      linhaDia('afife', 'Afife', NV_KITE0),
    ];
    expect(listaDeNoite(rows, 'kitesurf')).toBe(false);
    const ordem = [...rows].sort((a, b) => compareRanking(a, b, 'kitesurf', 'pt', NOITE));
    expect(ordem.map((r) => r.spot.id)).toEqual(['cova', 'vrsa', 'afife', 'alvor', 'az-anjos', 'az-agua']);
    // as linhas de dia mantêm a nota (o 3 não vira 0); só as dos Açores levam a lua
    expect(ordem.map((r) => getGridSpotScore(r, 'kitesurf'))).toEqual([30, 30, 0, 0, 0, 0]);
    expect(ordem.map((r) => linhaDeNoite(r, 'kitesurf'))).toEqual([false, false, false, false, true, true]);
    // a mesma lista no refresh do conditions.json servido (o caminho da página)
    const json: Record<string, unknown> = {
      'az-anjos': { notaV6: NV_NOITE },
      alvor: { notaV6: NV_KITE0 },
      vrsa: { notaV6: NV_KITE3 },
      'az-agua': { notaV6: NV_NOITE },
      cova: { notaV6: NV_KITE3 },
      afife: { notaV6: NV_KITE0 },
    };
    const vivos = refreshGridSpotScores(rows, json);
    expect(listaDeNoite(vivos, 'kitesurf')).toBe(false);
    expect(vivos.map((r) => getGridSpotScore(r, 'kitesurf'))).toEqual([0, 0, 30, 0, 30, 0]);
    expect(vivos.filter((r) => linhaDeNoite(r, 'kitesurf')).map((r) => r.spot.id)).toEqual(['az-anjos', 'az-agua']);
  });
});

describe('comparador de noite: «Amanhã ganha» só com janela nas próximas 24 h', () => {
  const nome = (x: { n: string }) => x.n;
  it('ganha a melhor janela das 24 h; fora das 24 h não ganha', () => {
    const a = { n: 'Guincho', j: J('2026-10-29T07:00', '2026-10-29T11:00', 80) };
    const b = { n: 'Carcavelos', j: J('2026-10-29T10:00', '2026-10-29T12:00', 70) };
    const c = { n: 'Arrifana', j: J('2026-10-30T08:00', '2026-10-30T11:00', 90) };
    const v = veredictoNoite([c, b, a], (x) => x.j, nome, NOITE, 'pt');
    expect(v.ordem.map(nome)).toEqual(['Guincho', 'Carcavelos', 'Arrifana']);
    expect(v.ganham24h.map(nome)).toEqual(['Guincho', 'Carcavelos']);
  });

  it('ninguém com janela nas 24 h → sem vencedor', () => {
    const c = { n: 'Arrifana', j: J('2026-10-30T08:00', '2026-10-30T11:00', 90) };
    const f = { n: 'Foz do Arelho', j: null };
    const v = veredictoNoite([f, c], (x) => x.j, nome, NOITE, 'pt');
    expect(v.ganham24h).toEqual([]);
    expect(v.ordem.map(nome)).toEqual(['Arrifana', 'Foz do Arelho']);
  });
});
