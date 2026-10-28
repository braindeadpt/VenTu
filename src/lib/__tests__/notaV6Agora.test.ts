import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spots } from '@/lib/spots';
import type { Spot } from '@/types';
import { notaHora, type SportScoreV6 } from '@/lib/notaUnica';
import {
  allScoresComV6,
  lerNotaV6Agora,
  notaV6DoSpot,
  scoresMotorAntigo,
  sportScoreDeNotaV6,
  type NotaV6Agora,
} from '@/lib/notaV6Agora';
import { escreverNotasV6Agora, linhaAgora, linhasAgora, notaV6AgoraDe, remendarFrame0 } from '@/lib/notaV6AgoraBuild';
import { getSportScore } from '@/lib/sportScore';

const req = createRequire(import.meta.url);
const { alertRowAt } = req('../../../scripts/lib/scoreSpotConditions.js') as {
  alertRowAt: (
    c: Record<string, unknown> | null,
    h: Array<Record<string, unknown>> | null,
    nowMs: number,
  ) => { row: Record<string, unknown> | null; t: string | undefined; fromForecast: boolean };
};

const ROOT = path.join(__dirname, '..', '..', '..');
const FIX = path.join(ROOT, 'tests/e2e/fixtures/data');
const ler = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const spotDe = (id: string) => (spots as Spot[]).find((s) => s.id === id)!;
const KN = 1.94384;

// 17/10 15:00 Lisboa (WEST)
const NOW_15H = Date.parse('2026-10-17T14:00:00Z');
const SNAP = { waveHeight: 1.2, wavePeriod: 9, waveDirection: 300, windSpeed: 5 / KN, windDirection: 335, windGust: 7 / KN, waterTemp: 17.6, observedWave: { marker: 'fica' } };
const HORAS = [
  { time: '2026-10-17T14:00', windSpeed: 12 / KN, windGust: 15 / KN, windDirection: 335, waveHeight: 1.2, wavePeriod: 9, waveDirection: 300, tideHeight: 1.4 },
  { time: '2026-10-17T15:00', windSpeed: 20 / KN, windGust: 24 / KN, windDirection: 335, waveHeight: 1.4, wavePeriod: 10, waveDirection: 300, tideHeight: 1.8, ens: { p10: 1 }, cloudCover: null },
  { time: '2026-10-17T16:00', windSpeed: 21 / KN, windGust: 25 / KN, windDirection: 335, waveHeight: 1.5, wavePeriod: 10, waveDirection: 300, tideHeight: 2.2 },
];

describe('linhaAgora (gémea TS de alertRowAt, D4)', () => {
  it('dá a mesma linha e hora que o alertRowAt dos alertas', () => {
    for (const nowMs of [NOW_15H, NOW_15H + 59 * 60_000, NOW_15H - 3_600_000, NOW_15H + 5 * 3_600_000]) {
      const js = alertRowAt(SNAP, HORAS, nowMs);
      const ts = linhaAgora(SNAP, HORAS, nowMs);
      expect(ts.row).toEqual(js.row);
      expect(ts.t).toBe(js.t);
      expect(ts.j >= 0).toBe(js.fromForecast);
    }
    expect(linhaAgora(null, null, NOW_15H)).toEqual({ row: null, j: -1, t: undefined });
  });

  it('a linha avaliada vai para o lugar da hora coberta (as vizinhas dão a maré)', () => {
    const alvo = linhasAgora(SNAP, HORAS, NOW_15H + 10 * 60_000)!;
    expect(alvo.j).toBe(1);
    expect(alvo.linhas[0]).toBe(HORAS[0]);
    expect(alvo.linhas[2]).toBe(HORAS[2]);
    expect(alvo.linhas[1]).toMatchObject({ time: '2026-10-17T15:00', waveHeight: 1.4, tideHeight: 1.8 });
    // sem a hora na série: a linha sozinha, com a hora de Lisboa
    const solta = linhasAgora(SNAP, [], NOW_15H)!;
    expect(solta.j).toBe(0);
    expect(solta.linhas[0].time).toBe('2026-10-17T15:00');
  });
});

describe('notaV6AgoraDe e o adaptador sportScoreDeNotaV6', () => {
  it('para os spots da fixture, o adaptador do notaV6 = sportScoreDeV6 da avaliação v6 (mesmo SportScore)', () => {
    const cond = ler('conditions.json') as Record<string, Record<string, unknown>>;
    const nowMs = new Date((ler('map-hours.json') as { generatedAt: string }).generatedAt).getTime();
    for (const id of ['guincho', 'nazare', 'carcavelos', 'supertubos', 'lagoa-albufeira', 'lagos', 'viana-cabedelo']) {
      const sp = spotDe(id);
      if (!sp) continue;
      const hours = ler(`forecasts/${sp.conditionsSource ?? sp.id}.json`) as Array<Record<string, unknown>>;
      const alvo = linhasAgora(cond[id], hours, nowMs)!;
      const nv = notaV6AgoraDe(sp, cond[id], hours, nowMs)!;
      for (const [sport, d] of [
        ['kitesurf', 'kite'],
        ['surf', 'surf'],
      ] as const) {
        const v6 = notaHora(sp, sport, alvo.linhas, alvo.j) as SportScoreV6;
        const a = sportScoreDeNotaV6(nv, d);
        const { motor: _m, nota: _n, ...esperado } = v6;
        expect(a, `${id} ${sport}`).toEqual(esperado);
      }
    }
  });

  it('noite → score 0 + noite; sem dados → semDados; seg/sp só no kite com nota', () => {
    const nv: NotaV6Agora = { t: '2026-09-08T14:00', kite: null, surf: null, sem: ['kite'] };
    expect(sportScoreDeNotaV6(nv, 'kite')).toMatchObject({ score: 0, rating: 'N/A', semDados: true });
    expect(sportScoreDeNotaV6(nv, 'kite').noite).toBeUndefined();
    expect(sportScoreDeNotaV6(nv, 'surf')).toMatchObject({ score: 0, rating: 'N/A', noite: true });
    const forte = sportScoreDeNotaV6({ t: 'x', kite: 3, surf: 2, sp: 1, f: { kite: ['34kt wind', 'side-onshore'] } }, 'kite');
    expect(forte).toMatchObject({ score: 30, soProfissionais: true, primaryFactor: '34kt' });
    expect(forte.warning).toBeTruthy();
    const off = sportScoreDeNotaV6({ t: 'x', kite: 2, surf: 5, seg: 'offshore', sp: 1 }, 'kite');
    expect(off.directionSafety).toBe('offshore');
    expect(sportScoreDeNotaV6({ t: 'x', kite: 2, surf: 5, seg: 'offshore' }, 'surf').directionSafety).toBeUndefined();
  });

  it('lerNotaV6Agora rejeita o que não é nota inteira 0–10 ou null', () => {
    expect(lerNotaV6Agora(undefined)).toBeNull();
    expect(lerNotaV6Agora({ t: 'x', kite: 7.5, surf: 1 })).toBeNull();
    expect(lerNotaV6Agora({ t: 'x', kite: 11, surf: 1 })).toBeNull();
    expect(lerNotaV6Agora({ kite: 1, surf: 1 })).toBeNull();
    expect(lerNotaV6Agora({ t: 'x', kite: null, surf: 3, seg: 'onshore', sem: ['kite', 'wake'], f: { kite: [1] } })).toEqual({
      t: 'x',
      kite: null,
      surf: 3,
      sem: ['kite'],
    });
  });

  it('allScoresComV6 (PR 6): as 5 v6 do notaV6, SUP e wakeboard no sportScore; sem notaV6 = v6 «sem dados»', () => {
    const sp = spotDe('guincho');
    const input = { waveHeight: 1.4, wavePeriod: 10, waveDirection: 300, windSpeed: 9, windDirection: 340, windGust: 11, waterTemp: 17 };
    const sem = allScoresComV6(sp, input, null);
    for (const s of ['kitesurf', 'surf', 'windsurf', 'bodyboard', 'foil'] as const) {
      expect(sem[s]).toMatchObject({ score: 0, rating: 'N/A', semDados: true });
    }
    for (const s of ['wakeboard', 'sup'] as const) expect(sem[s]).toEqual(getSportScore(sp, s, input));
    const com = allScoresComV6(sp, input, { t: 'x', kite: 6, surf: 3, windsurf: 4, bodyboard: null, foil: 7, vf: 'kitefoil' });
    expect(com.kitesurf.score).toBe(60);
    expect(com.surf.score).toBe(30);
    expect(com.windsurf.score).toBe(40);
    expect(com.bodyboard).toMatchObject({ score: 0, noite: true });
    expect(com.foil.score).toBe(70);
    // notaV6 anterior ao PR 6: as modalidades novas ficam «sem dados» (não «noite»)
    const antigo = allScoresComV6(sp, input, { t: 'x', kite: 6, surf: 3 });
    expect(antigo.windsurf).toMatchObject({ score: 0, semDados: true });
    expect(Object.keys(scoresMotorAntigo(sp, input)).sort()).toEqual(['sup', 'wakeboard']);
  });

  it('lerNotaV6Agora (PR 6): windsurf, bodyboard, foil, vf e sg; valores estragados caem fora', () => {
    expect(
      lerNotaV6Agora({ t: 'x', kite: 1, surf: 2, windsurf: 3, bodyboard: null, foil: 9, vf: 'surffoil', sg: { windsurf: 'offshore', foil: 'x' }, sem: ['foil'] }),
    ).toEqual({ t: 'x', kite: 1, surf: 2, windsurf: 3, bodyboard: null, foil: 9, vf: 'surffoil', sg: { windsurf: 'offshore' }, sem: ['foil'] });
    expect(lerNotaV6Agora({ t: 'x', kite: 1, surf: 2, windsurf: 3.5, vf: 'jet' })).toEqual({ t: 'x', kite: 1, surf: 2 });
  });

  it('sportScoreDeNotaV6 (PR 6): factor principal do foil pela vertente; aviso de direcção do windsurf', () => {
    const nv = { t: 'x', kite: 2, surf: 5, windsurf: 4, foil: 6, vf: 'surffoil' as const, sg: { windsurf: 'side-offshore' as const }, f: { foil: ['1.2m waves', '9kt wind'], windsurf: ['18kt wind', 'side-offshore'] } };
    expect(sportScoreDeNotaV6(nv, 'foil').primaryFactor).toBe('1.2m');
    expect(sportScoreDeNotaV6({ ...nv, vf: 'wing' }, 'foil').primaryFactor).toBe('9kt');
    const ws = sportScoreDeNotaV6(nv, 'windsurf');
    expect(ws.directionSafety).toBe('side-offshore');
    expect(ws.primaryFactor).toBe('18kt');
    expect(sportScoreDeNotaV6(nv, 'bodyboard')).toMatchObject({ score: 0, semDados: true });
  });
});

describe('escreverNotasV6Agora (pipeline)', () => {
  it('grava uma nota por spot na linha do próprio spot (spots com conditionsSource incluídos)', () => {
    const alias = (spots as Spot[]).find((s) => s.conditionsSource)!;
    const src = spotDe(alias.conditionsSource!);
    const cond: Record<string, Record<string, unknown>> = { [src.id]: { ...SNAP }, [alias.id]: { ...SNAP } };
    const r = escreverNotasV6Agora([src, alias], cond, (id) => (id === src.id ? HORAS : null), NOW_15H);
    expect(r.escritos).toBe(2);
    expect(cond[src.id].notaV6).toEqual(notaV6AgoraDe(src, cond[src.id], HORAS, NOW_15H));
    // o alias usa a série da fonte, mas a praia (editorial) dele
    expect(cond[alias.id].notaV6).toEqual(notaV6AgoraDe(alias, cond[alias.id], HORAS, NOW_15H));
    expect(notaV6DoSpot(alias, cond)).toEqual(cond[alias.id].notaV6);
  });
});

describe('remendarFrame0 (map-hours depois das observações)', () => {
  const file = () => ({
    times: ['2026-10-17T15:00', '2026-10-17T18:00'],
    spots: {
      guincho: { kitesurf: [10, 20], surf: [30, 40], windsurf: [55, 50], best: [55, 50] },
      nazare: { kitesurf: [0, 0], surf: [80, 70], windsurf: [20, 20], best: [80, 70] },
    } as Record<string, Record<string, Array<number | null>>>,
  });

  it('frame 0 = a hora corrente: kitesurf/surf = notaV6 × 10 e best recalculado', () => {
    const f = file();
    const n = remendarFrame0(f, { guincho: { t: 'x', kite: 7, surf: 3 }, nazare: { t: 'x', kite: null, surf: null } }, NOW_15H + 60_000);
    expect(n).toBe(2);
    expect(f.spots.guincho).toEqual({ kitesurf: [70, 20], surf: [30, 40], windsurf: [55, 50], best: [70, 50] });
    expect(f.spots.nazare).toEqual({ kitesurf: [null, 0], surf: [null, 70], windsurf: [20, 20], best: [20, 70] });
  });

  it('frame 0 já no passado (run só de observações, horas depois): não mexe', () => {
    const f = file();
    expect(remendarFrame0(f, { guincho: { t: 'x', kite: 7, surf: 3 } }, NOW_15H + 3 * 3_600_000)).toBe(0);
    expect(f).toEqual(file());
  });
});

describe('isSemDados — Compare / Favoritos sem `notaV6` (#218, PR 6)', () => {
  it('v6 sem notaV6 → sem dados; SUP / wakeboard (motor antigo) e v6 com nota → não', async () => {
    const { isSemDados, scoreAgoraComV6, allScoresComV6 } = await import('@/lib/notaV6Agora');
    const { spots } = await import('@/lib/spots');
    const sp = spots.find((s) => s.id === 'guincho')!;
    const input = { waveHeight: 1.2, wavePeriod: 9, waveDirection: 300, windSpeed: 8, windDirection: 330, windGust: 10, waterTemp: 17 };
    for (const d of ['surf', 'kitesurf', 'windsurf', 'bodyboard', 'foil'] as const) {
      expect(isSemDados(scoreAgoraComV6(sp, d, input, null))).toBe(true);
    }
    expect(isSemDados(scoreAgoraComV6(sp, 'sup', input, null))).toBe(false);
    const all = allScoresComV6(sp, input, { t: '2026-10-17T15:00', kite: 7, surf: 4, windsurf: 6, bodyboard: 4, foil: 6 });
    expect(isSemDados(all.kitesurf)).toBe(false);
    expect(isSemDados(all.wakeboard)).toBe(false);
    expect(isSemDados(null)).toBe(false);
  });
});
