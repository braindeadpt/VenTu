import { describe, expect, it } from 'vitest';
import { pickHeroBestWindow } from '@/lib/heroBestWindow';
import { getTopNowCards, type HomepageSpotData } from '@/lib/homepageSport';
import type { SportScore } from '@/lib/sportScore';
import type { SportType } from '@/lib/sportRatings';
import type { Spot } from '@/types';

const NOW = new Date('2026-10-07T08:00:00').getTime();

function score(n: number): SportScore {
  return { score: n, rating: '', ratingEn: '', factors: [], factorsEn: [], primaryFactor: '' };
}

function row(
  slug: string,
  opts: {
    lat: number;
    lon: number;
    sports: SportType[];
    scores?: Partial<Record<SportType, number>>;
    today?: HomepageSpotData['bestWindowsBySport'];
    upcoming?: HomepageSpotData['upcomingWindowsBySport'];
  },
): HomepageSpotData {
  const s = opts.scores ?? {};
  return {
    spot: {
      id: slug,
      slug,
      name: slug,
      nameEn: slug,
      region: 'x',
      regionEn: 'x',
      lat: opts.lat,
      lon: opts.lon,
      type: 'multisport',
      compatibleSports: opts.sports,
    } as Spot,
    conditions: {} as HomepageSpotData['conditions'],
    allScores: {
      surf: score(s.surf ?? 0),
      kitesurf: score(s.kitesurf ?? 0),
      windsurf: score(s.windsurf ?? 0),
      bodyboard: score(s.bodyboard ?? 0),
      wakeboard: score(0),
      sup: score(0),
      foil: score(s.foil ?? 0),
    },
    bestWindowToday: null,
    bestWindowsBySport: opts.today ?? {},
    upcomingWindowsBySport: opts.upcoming ?? {},
  };
}

// Praia da Vitória (Terceira, Açores) vs Ericeira (continente).
const azores = row('praia-vitoria', {
  lat: 38.73,
  lon: -27.06,
  sports: ['surf', 'bodyboard'],
  scores: { surf: 61 },
  today: { surf: { start: 7, end: 12, score: 70 } },
});
const ericeira = row('ericeira', {
  lat: 38.96,
  lon: -9.42,
  sports: ['surf'],
  scores: { surf: 40 },
  today: { surf: { start: 15, end: 18, score: 55 } },
});

describe('pickHeroBestWindow', () => {
  it('com o mapa no continente não promove os Açores', () => {
    const pick = pickHeroBestWindow([azores, ericeira], 'surf', 'continent', NOW);
    expect(pick?.data.spot.slug).toBe('ericeira');
    expect(pick?.inArea).toBe(true);
  });

  it('com o mapa nos Açores promove o spot dos Açores', () => {
    const pick = pickHeroBestWindow([azores, ericeira], 'surf', 'azores', NOW);
    expect(pick?.data.spot.slug).toBe('praia-vitoria');
  });

  it('sem janelas na área visível recorre ao melhor de qualquer área', () => {
    const pick = pickHeroBestWindow([azores], 'surf', 'continent', NOW);
    expect(pick?.data.spot.slug).toBe('praia-vitoria');
    expect(pick?.inArea).toBe(false);
  });

  it('Kitesurf: sem janela heurística de hoje usa a janela canónica das próximas 24 h', () => {
    const kite = row('amorosa', {
      lat: 41.64,
      lon: -8.82,
      sports: ['kitesurf'],
      scores: { kitesurf: 100 },
      upcoming: {
        kitesurf: { startIso: '2026-10-07T13:00', endIso: '2026-10-07T18:00', score: 96 },
      },
    });
    const pick = pickHeroBestWindow([azores, ericeira, kite], 'kitesurf', 'continent', NOW);
    expect(pick?.data.spot.slug).toBe('amorosa');
    expect(pick?.window).toEqual({ start: 13, end: 18, score: 96, sport: 'kitesurf' });
  });

  it('nunca troca de desporto: um filtro sem janelas devolve null', () => {
    expect(pickHeroBestWindow([azores, ericeira], 'windsurf', 'continent', NOW)).toBeNull();
  });

  it('ignora janelas canónicas que já acabaram ou começam depois de 24 h', () => {
    const late = row('late', {
      lat: 39.5,
      lon: -9.2,
      sports: ['kitesurf'],
      upcoming: {
        kitesurf: { startIso: '2026-10-08T20:00', endIso: '2026-10-08T22:00', score: 90 },
      },
    });
    expect(pickHeroBestWindow([late], 'kitesurf', 'continent', NOW)).toBeNull();
  });

  it('não anuncia como «hoje» uma janela canónica que só começa amanhã', () => {
    const tomorrow = row('tomorrow', {
      lat: 39.5,
      lon: -9.2,
      sports: ['kitesurf'],
      upcoming: {
        kitesurf: { startIso: '2026-10-08T07:00', endIso: '2026-10-08T10:00', score: 90 },
      },
    });
    expect(pickHeroBestWindow([tomorrow], 'kitesurf', 'continent', NOW)).toBeNull();
  });
});

describe('getTopNowCards (A bombar agora reage ao filtro)', () => {
  const kiteA = row('kite-a', { lat: 41, lon: -8.8, sports: ['kitesurf'], scores: { kitesurf: 100 } });
  const kiteB = row('kite-b', { lat: 40, lon: -8.9, sports: ['kitesurf'], scores: { kitesurf: 85 } });
  const kiteWeak = row('kite-c', { lat: 40, lon: -8.9, sports: ['kitesurf'], scores: { kitesurf: 30 } });

  it('«Todos» mantém um card por desporto', () => {
    const cards = getTopNowCards([azores, kiteA, kiteB], 'all');
    expect(cards.map((c) => c.sport)).toEqual(['surf', 'kitesurf']);
  });

  it('com Kitesurf mostra só spots de kite a bombar, ordenados', () => {
    const cards = getTopNowCards([azores, kiteWeak, kiteB, kiteA], 'kitesurf');
    expect(cards.map((c) => c.data.spot.slug)).toEqual(['kite-a', 'kite-b']);
    expect(cards.every((c) => c.sport === 'kitesurf')).toBe(true);
  });

  it('respeita maxCards', () => {
    expect(getTopNowCards([kiteA, kiteB], 'kitesurf', 1)).toHaveLength(1);
  });
});
