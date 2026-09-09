import { describe, it, expect } from 'vitest';
import { renderSpotPopup, type SpotPopupContentProps } from '../SpotPopupContent';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';

const SPORTS: SportType[] = ['surf', 'kitesurf', 'windsurf', 'wakeboard', 'bodyboard', 'sup', 'foil'];

function makeSpot(overrides: Partial<Spot> = {}): Spot {
  return {
    id: 'nazare',
    slug: 'nazare',
    name: 'Nazaré',
    nameEn: 'Nazare',
    region: 'Centro',
    regionEn: 'Central',
    lat: 39.597,
    lon: -9.073,
    type: 'surf',
    difficulty: 'advanced',
    bestWind: 'N',
    bestSwell: 'NW',
    coastOrientation: 0,
    description: 'Praia lendária.',
    descriptionEn: 'Legendary beach.',
    facilities: [],
    hazards: [],
    ...overrides,
  };
}

function makeScores(score: number): Record<SportType, SportScore> {
  const base: SportScore = {
    score,
    rating: score > 0 ? 'Bom' : 'N/A',
    ratingEn: score > 0 ? 'Good' : 'N/A',
    factors: [],
    primaryFactor: 'Ondas',
  };
  return Object.fromEntries(SPORTS.map((s) => [s, { ...base }])) as Record<SportType, SportScore>;
}

function render(overrides: Partial<SpotPopupContentProps> = {}): string {
  return renderSpotPopup({
    spot: makeSpot(),
    locale: 'pt',
    detailHref: '/pt/spots/nazare/',
    allScores: makeScores(0),
    swellHeight: '2.1',
    swellPeriod: '12',
    windKnots: '18',
    windDirection: 'NW',
    waterTemp: '17',
    wavePowerKw: '12.4',
    ...overrides,
  });
}

describe('SpotPopupContent (contrato de layout do popup)', () => {
  it('CTA «Ver spot» tem alvo ≥44px (WCAG 2.5.8) e href do spot', () => {
    const html = render();
    expect(html).toContain('ventu-popup-detail');
    expect(html).toContain('min-h-[44px]');
    expect(html).toContain('href="/pt/spots/nazare/"');
    expect(html).toContain('Ver spot');
  });

  it('com score > 0, o badge de score fica em right-12 — desviado do ✕ (44px) do popup', () => {
    const html = render({ allScores: makeScores(72) });
    // O stack do badge usa right-12 (48px) e NÃO right-1.5 — a 44px do canto
    // está o close do Leaflet; antes o badge ficava por baixo dele.
    expect(html).toContain('right-12');
    expect(html).not.toContain('top-1.5 right-1.5');
    expect(html).toContain('>72</span>');
  });

  it('sem score (>0) nenhum, não renderiza o badge de score', () => {
    const html = render({ allScores: makeScores(0) });
    expect(html).not.toContain('right-12');
    expect(html).not.toContain('aria-label="Score: 0"');
  });

  it('inclui nome, região e leitura de vento no conteúdo', () => {
    const html = render();
    expect(html).toContain('Nazaré');
    expect(html).toContain('Centro');
    expect(html).toContain('18kt NW');
  });
});