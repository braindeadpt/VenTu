import { describe, expect, it } from 'vitest';
import { spots } from '@/lib/spots';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import { getSportScore, type SportScore } from '@/lib/sportScore';
import { rawToScoreInput } from '@/lib/scoreConditions';
import { notaTier, scoreTierFromScore, scoreToNota, SCORE_TIER_THRESHOLDS } from '@/lib/nota';
import { getTranslation } from '@/lib/i18n';
import { avaliaHoras, bandaDe, type AvaliacaoHora, type HoraModalidade } from '@/lib/modalidades';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';
import { getSpotScoreFactors } from '@/lib/spotScoreFactors';
import type { LinhaForecast } from '@/lib/horaSpot';
import {
  bandaDoScore,
  comparaHora,
  modalidadeDe,
  notaHora,
  sportScoreDeV6,
  type SportScoreV6,
} from '@/lib/notaUnica';

const guincho = (spots as Spot[]).find((s) => s.id === 'guincho')!;
const ed = editorialDe(guincho);
const sp = spotModalidadeDe(ed);
const PV = ed.praiaVirada;

const hora = (o: Partial<HoraModalidade>): HoraModalidade => ({
  t: '2026-09-08T14:00',
  w: 20,
  g: 24,
  wd: PV + 50,
  hs: 1.0,
  tp: 10,
  sd: PV,
  tide: 2.0,
  tideUp: true,
  cloud: null,
  rain: null,
  sunEl: 40,
  sunAz: 200,
  ...o,
});

const adapta = (d: 'kite' | 'surf', h: HoraModalidade) => sportScoreDeV6(avaliaHoras(sp, d, [h])[0], h, d, PV);

describe('notaUnica — modalidadeDe', () => {
  it('só kitesurf e surf passam pelo v6; o resto fica no sportScore (D5)', () => {
    expect(modalidadeDe('kitesurf')).toBe('kite');
    expect(modalidadeDe('surf')).toBe('surf');
    for (const s of ['windsurf', 'bodyboard', 'foil', 'wakeboard', 'sup'] as SportType[]) expect(modalidadeDe(s)).toBeNull();
  });
});

describe('notaUnica — sportScoreDeV6 (adaptador para o formato SportScore)', () => {
  it('score = nota × 10: scoreToNota devolve a nota v6 e as bandas da #210 coincidem, de 0 a 10', () => {
    const h = hora({});
    for (let n = 0; n <= 10; n++) {
      const av: AvaliacaoHora = { n, f: { vento: 0, onda: 0, mare: 0 }, nMotor: n, seguranca: null };
      const s = sportScoreDeV6(av, h, 'surf', PV);
      expect(s.score).toBe(n * 10);
      expect(scoreToNota(s.score)).toBe(n);
      expect(scoreTierFromScore(s.score)).toBe(notaTier(n));
      expect(bandaDoScore(s.score)).toBe(bandaDe(n));
      // «Só ON» do /mapa (MAP_ON_THRESHOLD = 65) ⇔ nota ≥ 7
      expect(s.score >= SCORE_TIER_THRESHOLDS.good).toBe(n >= 7);
      if (n === 0) expect(s.rating).toBe('N/A');
      else expect(s.rating).toBe(getTranslation('pt').tiers[notaTier(n) === 'closed' ? 'closed' : notaTier(n)]);
    }
  });

  it('kite de dia: nota igual a avaliaHoras, factores com vento + categoria (lidos pelo spotScoreFactors)', () => {
    const h = hora({});
    const av = avaliaHoras(sp, 'kite', [h])[0];
    const s = adapta('kite', h);
    expect(s.motor).toBe('v6');
    expect(s.nota).toBe(av.n);
    expect(s.score).toBe((av.n as number) * 10);
    expect(s.factorsEn[0]).toBe('20kt wind');
    expect(s.factors[0]).toBe('20kt vento');
    expect(s.factorsEn[1]).toBe('side-onshore');
    expect(s.primaryFactor).toBe('20kt');
    expect(s.noite).toBeUndefined();
    expect(s.directionSafety).toBeUndefined();

    const allScores = { kitesurf: s } as unknown as Record<SportType, SportScore>;
    const seg = getSpotScoreFactors({
      spot: guincho,
      conditions: { waveHeight: 1, wavePeriod: 10, waveDirection: PV, windSpeed: 20 / 1.94384, windDirection: h.wd, waterTemp: 18 } as never,
      allScores,
      sport: 'kitesurf',
      locale: 'pt',
    });
    expect(seg[0].kind).toBe('wind');
  });

  it('noite: sem nota → score 0, «N/A», marca noite e nenhum factor', () => {
    const s = adapta('kite', hora({ sunEl: -10 }));
    expect(s.nota).toBeNull();
    expect(s.score).toBe(0);
    expect(s.rating).toBe('N/A');
    expect(s.ratingEn).toBe('N/A');
    expect(s.noite).toBe(true);
    expect(s.semDados).toBeUndefined();
    expect(s.factorsEn).toEqual([]);
  });

  it('sem dados na fonte: score 0 e marca semDados (não é noite)', () => {
    const s = adapta('kite', hora({ semDados: ['vento'] }));
    expect(s.nota).toBeNull();
    expect(s.score).toBe(0);
    expect(s.semDados).toBe(true);
    expect(s.noite).toBeUndefined();
    const surf = adapta('surf', hora({ semDados: ['onda'] }));
    expect(surf.semDados).toBe(true);
  });

  it('vento de terra no kite: tecto offshore, directionSafety e o mesmo aviso do motor antigo', () => {
    const s = adapta('kite', hora({ wd: (PV + 180) % 360 }));
    expect(s.directionSafety).toBe('offshore');
    expect(s.warning).toBe(getTranslation('pt').windSafety.offshore);
    expect(s.warningEn).toBe(getTranslation('en').windSafety.offshore);
    expect(s.score).toBeLessThanOrEqual(20);
    const lat = adapta('kite', hora({ wd: (PV + 120) % 360 }));
    expect(lat.directionSafety).toBe('side-offshore');
    expect(lat.warning).toBe(getTranslation('pt').windSafety.sideOffshore);
    expect(lat.score).toBeLessThanOrEqual(50);
  });

  it('surf: factores de onda e período; vento de mar forte passa para a frente', () => {
    const limpo = adapta('surf', hora({ hs: 1.8, tp: 13, w: 4, g: 6, wd: (PV + 180) % 360 }));
    expect(limpo.factorsEn).toContain('1.8m waves');
    expect(limpo.factorsEn).toContain('13s period');
    expect(limpo.primaryFactor).toBe('1.8m');
    expect(limpo.directionSafety).toBeUndefined();
    const ventoso = adapta('surf', hora({ hs: 1.2, tp: 10, w: 22, g: 28, wd: PV }));
    expect(ventoso.factorsEn[0]).toBe('22kt wind');
    expect(ventoso.factorsEn).toContain('1.2m waves');
    expect(ventoso.factorsEn).not.toContain('10s period');
  });
});

describe('notaUnica — notaHora', () => {
  const linhas: LinhaForecast[] = [
    { time: '2026-09-08T13:00+01:00', windSpeed: 9, windGust: 11, windDirection: 330, waveHeight: 1.2, wavePeriod: 11, waveDirection: 290, waterTemp: 18, tideHeight: 0.3 },
    { time: '2026-09-08T14:00+01:00', windSpeed: 10, windGust: 12, windDirection: 335, waveHeight: 1.3, wavePeriod: 11, waveDirection: 290, waterTemp: 18, tideHeight: 0.5 },
    { time: '2026-09-08T15:00+01:00', windSpeed: 10, windGust: 13, windDirection: 340, waveHeight: 1.3, wavePeriod: 12, waveDirection: 292, waterTemp: 18, tideHeight: 0.6 },
  ];

  it('kitesurf e surf: a nota é a do v6 (a mesma da página do spot)', () => {
    for (const sport of ['kitesurf', 'surf'] as const) {
      const r = notaHora(guincho, sport, linhas, 1) as SportScoreV6;
      expect(r.motor).toBe('v6');
      const c = comparaHora(guincho, sport, linhas, 1);
      expect(c.v6.nota).toBe(r.nota);
      expect(c.t).toBe('2026-09-08T14:00');
    }
  });

  it('as outras modalidades ficam no sportScore, com o mesmo número de hoje', () => {
    for (const sport of ['windsurf', 'bodyboard', 'foil', 'wakeboard', 'sup'] as SportType[]) {
      const r = notaHora(guincho, sport, linhas, 1);
      expect(r.motor).toBe('antigo');
      expect(r.score).toBe(getSportScore(guincho, sport, rawToScoreInput(linhas[1] as never)).score);
    }
  });

  it('comparaHora: o lado «antigo» é o sportScore sobre a mesma linha', () => {
    const c = comparaHora(guincho, 'surf', linhas, 2);
    const old = getSportScore(guincho, 'surf', rawToScoreInput(linhas[2] as never)).score;
    expect(c.antigo.score).toBe(old);
    expect(c.antigo.nota).toBe(scoreToNota(old));
  });
});
