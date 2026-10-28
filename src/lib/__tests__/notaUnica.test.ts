import { describe, expect, it } from 'vitest';
import { spots } from '@/lib/spots';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import { getSportScore, type SportScore } from '@/lib/sportScore';
import { rawToScoreInput } from '@/lib/scoreConditions';
import { notaTier, scoreTierFromScore, scoreToNota, SCORE_TIER_THRESHOLDS } from '@/lib/nota';
import { getTranslation } from '@/lib/i18n';
import { avaliaHoras, avaliaHorasSite, bandaDe, melhorVertente, VERTENTES_FOIL, type AvaliacaoHora, type HoraModalidade } from '@/lib/modalidades';
import { horaDeLinha } from '@/lib/horaSpot';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';
import { getSpotScoreFactors } from '@/lib/spotScoreFactors';
import type { LinhaForecast } from '@/lib/horaSpot';
import {
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
  it('PR 6: surf, kitesurf, windsurf, bodyboard e foil no v6; só SUP e wakeboard no sportScore', () => {
    expect(modalidadeDe('kitesurf')).toBe('kite');
    expect(modalidadeDe('surf')).toBe('surf');
    expect(modalidadeDe('windsurf')).toBe('windsurf');
    expect(modalidadeDe('bodyboard')).toBe('bodyboard');
    expect(modalidadeDe('foil')).toBe('foil');
    for (const s of ['wakeboard', 'sup'] as SportType[]) expect(modalidadeDe(s)).toBeNull();
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
      expect(bandaDe(scoreToNota(s.score))).toBe(bandaDe(n));
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

  it('as cinco modalidades v6: a nota é a do v6 (a mesma da página do spot)', () => {
    const ed = editorialDe(guincho);
    const h = horaDeLinha(linhas, 1, { lat: guincho.lat, lon: guincho.lon, praiaVirada: ed.praiaVirada });
    for (const [sport, d] of [
      ['kitesurf', 'kite'],
      ['surf', 'surf'],
      ['windsurf', 'windsurf'],
      ['bodyboard', 'bodyboard'],
    ] as const) {
      const r = notaHora(guincho, sport, linhas, 1) as SportScoreV6;
      expect(r.motor).toBe('v6');
      expect(r.nota).toBe(avaliaHoras(spotModalidadeDe(ed), d, [h])[0].n);
    }
  });

  it('foil: a melhor das três vertentes (wing, kitefoil, surffoil) nessa hora', () => {
    const ed = editorialDe(guincho);
    const h = horaDeLinha(linhas, 1, { lat: guincho.lat, lon: guincho.lon, praiaVirada: ed.praiaVirada });
    const notas = VERTENTES_FOIL.map((v) => avaliaHoras(spotModalidadeDe(ed), v, [h])[0].n ?? -1);
    const r = notaHora(guincho, 'foil', linhas, 1) as SportScoreV6;
    expect(r.motor).toBe('v6');
    expect(r.nota).toBe(Math.max(...notas));
    expect(r.vertente).toBe(VERTENTES_FOIL[notas.indexOf(Math.max(...notas))]);
  });

  it('SUP e wakeboard ficam no sportScore, com o mesmo número de hoje', () => {
    for (const sport of ['wakeboard', 'sup'] as const) {
      const r = notaHora(guincho, sport, linhas, 1);
      expect(r.motor).toBe('antigo');
      expect(r.score).toBe(getSportScore(guincho, sport, rawToScoreInput(linhas[1] as never)).score);
    }
  });
});

describe('notaUnica — foil (melhor vertente, decisão do Pedro 27/10)', () => {
  const av = (n: number | null, extra: Partial<AvaliacaoHora> = {}): AvaliacaoHora => ({
    n, f: { vento: 0, onda: 0, mare: 0 }, nMotor: n, seguranca: null, ...extra,
  });

  it('melhorVertente: a nota mais alta ganha; empate → a primeira (wing, kitefoil, surffoil)', () => {
    expect(melhorVertente([av(3), av(6), av(5)])).toMatchObject({ n: 6, chave: 'kitefoil' });
    expect(melhorVertente([av(4), av(4), av(4)])).toMatchObject({ n: 4, chave: 'wing' });
    expect(melhorVertente([av(null), av(null), av(2)])).toMatchObject({ n: 2, chave: 'surffoil' });
  });

  it('melhorVertente sem nota: noite (não «sem dados») se pelo menos uma vertente tem dados', () => {
    expect(melhorVertente([av(null, { semDados: true }), av(null), av(null)]).semDados).toBeFalsy();
    expect(melhorVertente([av(null, { semDados: true }), av(null, { semDados: true }), av(null, { semDados: true })]).semDados).toBe(true);
  });

  it('avaliaHorasSite(foil) = máximo hora a hora de avaliaHoras nas três vertentes', () => {
    const horas = [hora({ w: 6, g: 8 }), hora({ w: 14, g: 16 }), hora({ w: 22, g: 25 }), hora({ w: 4, hs: 1.4, tp: 12 })];
    const site = avaliaHorasSite(sp, 'foil', horas);
    const por = VERTENTES_FOIL.map((v) => avaliaHoras(sp, v, horas));
    site.forEach((a, i) => {
      const ns = por.map((p) => p[i].n ?? -1);
      expect(a.n ?? -1).toBe(Math.max(...ns));
    });
  });

  it('de noite o foil não tem nota (marca noite)', () => {
    const r = sportScoreDeV6(avaliaHorasSite(sp, 'foil', [hora({ sunEl: -10 })])[0], hora({ sunEl: -10 }), 'wing', PV);
    expect(r.score).toBe(0);
    expect(r.noite).toBe(true);
  });
});

describe('notaUnica — kite com vento forte (#330) e água interior (#326)', () => {
  it('«Só profissionais» passa pelo adaptador: flag e aviso do vento forte (PT e EN)', () => {
    const h = hora({ w: 33, g: 36, wd: PV + 45 }); // lateral de mar, 33 kt médios
    const av = avaliaHoras(sp, 'kite', [h])[0];
    expect(av.soProfissionais).toBe(true);
    const s = sportScoreDeV6(av, h, 'kite', PV);
    expect(s.soProfissionais).toBe(true);
    expect(s.warning).toBe(getTranslation('pt').windSafety.soProfissionais);
    expect(s.warningEn).toBe(getTranslation('en').windSafety.soProfissionais);
  });

  it('abaixo dos 30 kt não há «Só profissionais» nem aviso de vento forte', () => {
    const h = hora({ w: 22, g: 26, wd: PV + 45 });
    const s = sportScoreDeV6(avaliaHoras(sp, 'kite', [h])[0], h, 'kite', PV);
    expect(s.soProfissionais).toBeUndefined();
    expect(s.warning).toBeUndefined();
  });

  it('água interior com 33 kt médios: «Só profissionais» (flag + aviso), nota no piso 3', () => {
    const lagoa = (spots as Spot[]).find((s) => s.aguaInterior)!;
    const e = editorialDe(lagoa);
    const h = hora({ w: 33, g: 36, wd: e.praiaVirada + 180 });
    const av = avaliaHoras(spotModalidadeDe(e), 'kite', [h])[0];
    expect(av.soProfissionais).toBe(true);
    expect(av.n).toBe(3);
    const s = sportScoreDeV6(av, h, 'kite', e.praiaVirada, true);
    expect(s.soProfissionais).toBe(true);
    expect(s.nota).toBe(3);
    expect(s.directionSafety).toBeUndefined();
    expect(s.warning).toBe(getTranslation('pt').windSafety.soProfissionais);
    expect(s.warningEn).toBe(getTranslation('en').windSafety.soProfissionais);
  });

  it('água interior com 22 kt: sem «Só profissionais» nem aviso', () => {
    const lagoa = (spots as Spot[]).find((s) => s.aguaInterior)!;
    const e = editorialDe(lagoa);
    const h = hora({ w: 22, g: 25, wd: e.praiaVirada + 180 });
    const s = sportScoreDeV6(avaliaHoras(spotModalidadeDe(e), 'kite', [h])[0], h, 'kite', e.praiaVirada, true);
    expect(s.soProfissionais).toBeUndefined();
    expect(s.warning).toBeUndefined();
  });

  it('água interior: sem categoria de vento nos factores (direcção neutra)', () => {
    const lagoa = (spots as Spot[]).find((s) => s.aguaInterior)!;
    const e = editorialDe(lagoa);
    const h = hora({ w: 18, g: 21, wd: e.praiaVirada + 180 });
    const s = sportScoreDeV6(avaliaHoras(spotModalidadeDe(e), 'kite', [h])[0], h, 'kite', e.praiaVirada, true);
    const cats = ['onshore', 'side-onshore', 'cross-shore', 'side-offshore', 'offshore'];
    expect(s.factors.some((f) => cats.includes(f))).toBe(false);
    expect(s.warning).toBeUndefined();
  });
});
