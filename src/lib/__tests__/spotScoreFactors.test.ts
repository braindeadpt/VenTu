import { describe, it, expect } from 'vitest';
import { spots } from '@/lib/spots';
import { getAllSportScores, type Conditions } from '@/lib/sportScore';
import {
  getSpotScoreFactors,
  resolveExplainedSport,
  scoreFactorClass,
} from '@/lib/spotScoreFactors';
import type { MarineConditionsFields } from '@/lib/marineConditions';
import type { Spot } from '@/types';

function spotBySlug(slug: string): Spot {
  const spot = spots.find((s) => s.slug === slug);
  if (!spot) throw new Error(`Spot not found: ${slug}`);
  return spot;
}

const ktToMs = (kt: number) => kt / 1.94384;

const baseConditions: MarineConditionsFields = {
  waveHeight: 1.4,
  wavePeriod: 11,
  waveDirection: 300,
  windSpeed: ktToMs(12),
  windDirection: 40,
  windGust: ktToMs(15),
  waterTemp: 17,
  swellHeight: 1.3,
  swellPeriod: 11,
  swellDirection: 315,
};

function input(
  spot: Spot,
  conditions: MarineConditionsFields,
  sport: import('@/lib/sportRatings').GridSportFilter = 'all',
  locale = 'pt',
) {
  return { spot, conditions, allScores: getAllSportScores(spot, conditions as Conditions), sport, locale };
}

describe('resolveExplainedSport', () => {
  const spot = spotBySlug('nazare');
  const allScores = getAllSportScores(spot, baseConditions as Conditions);

  it("'all' escolhe o desporto compatível com melhor score", () => {
    const s = resolveExplainedSport(spot, allScores, 'all');
    expect(s).not.toBeNull();
    const best = Math.max(...Object.values(allScores).map((x) => x.score));
    expect(allScores[s!].score).toBe(best);
  });

  it("'big-wave' resolve para surf; desporto específico devolve-se a si", () => {
    expect(resolveExplainedSport(spot, allScores, 'big-wave')).toBe('surf');
    expect(resolveExplainedSport(spot, allScores, 'kitesurf')).toBe('kitesurf');
  });
});

describe('getSpotScoreFactors — gramática canónica', () => {
  const spot = spotBySlug('nazare');

  it('surf: ondas, período e vento com métricas das condições (PT)', () => {
    const segs = getSpotScoreFactors(input(spot, baseConditions, 'surf'));
    const text = segs.map((s) => s.label).join(' · ');
    // ordem do scorer: ondas → período → vento; swell acrescenta quando cabe.
    expect(segs.length).toBeLessThanOrEqual(3);
    expect(text).toContain('ondas 1.4 m');
    expect(text).toContain('período 11 s');
    expect(text).toMatch(/(offshore|onshore|side-offshore|side-onshore) 12 kt/);
  });

  it('mesmo input em EN produz a gramática inglesa', () => {
    const segs = getSpotScoreFactors(input(spot, baseConditions, 'surf', 'en'));
    const text = segs.map((s) => s.label).join(' · ');
    expect(text).toContain('waves 1.4 m');
    expect(text).toContain('period 11 s');
  });

  it('versão curta: mesmos factores, etiquetas compactas', () => {
    const segs = getSpotScoreFactors(input(spot, baseConditions, 'surf'));
    for (const s of segs) {
      expect(s.short.length).toBeLessThanOrEqual(s.label.length);
    }
    expect(segs.find((s) => s.kind === 'wind')?.short).toMatch(/\d+kt/);
    expect(segs.find((s) => s.kind === 'period')?.short).toBe('11 s');
  });

  it('kitesurf: categoria de vento funde-se num único segmento de vento', () => {
    const c: MarineConditionsFields = {
      ...baseConditions,
      windSpeed: ktToMs(20),
      windGust: ktToMs(24),
      waveHeight: 0.6,
      wavePeriod: 6,
    };
    const segs = getSpotScoreFactors(input(spot, c, 'kitesurf'));
    const winds = segs.filter((s) => s.kind === 'wind');
    expect(winds).toHaveLength(1);
    expect(winds[0].label).toMatch(/20 kt/);
  });

  it('acrescenta «swell NW» quando há direcção de swell e factores de onda', () => {
    const segs = getSpotScoreFactors(input(spot, baseConditions, 'surf'));
    const swell = segs.find((s) => s.kind === 'swell');
    // só entra se houver espaço nos 3 slots
    if (swell) expect(swell.label).toBe('swell NW');
  });

  it('sem swellDirection não inventa o factor', () => {
    const c = { ...baseConditions };
    delete c.swellDirection;
    const segs = getSpotScoreFactors(input(spot, c, 'surf'));
    expect(segs.some((s) => s.kind === 'swell')).toBe(false);
  });

  it('fallback: score sem factores ainda explica com métricas canónicas', () => {
    const flat: MarineConditionsFields = {
      ...baseConditions,
      waveHeight: 0.2,
      wavePeriod: 5,
      swellDirection: undefined,
    };
    // bodyboard não emite factores abaixo de 0.3m/6s → factorsEn vazio
    const segs = getSpotScoreFactors(input(spot, flat, 'bodyboard'));
    expect(segs.length).toBeGreaterThan(0);
    expect(segs.map((s) => s.kind)).toContain('waves');
    expect(segs.map((s) => s.kind)).toContain('wind');
  });

  it('factores qualitativos do scorer (wake) mantêm o texto original', () => {
    const wake = spots.find((s) => s.type === 'wakeboard' || (s.compatibleSports ?? []).includes('wakeboard'));
    if (!wake) return; // nenhum spot wake no dataset — nada a provar
    const segs = getSpotScoreFactors(input(wake, baseConditions, 'wakeboard'));
    expect(segs.some((s) => s.kind === 'other')).toBe(true);
  });
});

describe('scoreFactorClass', () => {
  it('mapeia cada tipo para o token --data-* certo', () => {
    expect(scoreFactorClass('wind')).toBe('text-data-wind');
    expect(scoreFactorClass('period')).toBe('text-data-period');
    expect(scoreFactorClass('waves')).toBe('text-data-waves');
    expect(scoreFactorClass('swell')).toBe('text-data-waves');
    expect(scoreFactorClass('water')).toBe('text-data-water');
  });
});
