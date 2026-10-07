import { describe, expect, it } from 'vitest';
import { pickHeroBestWindow } from '@/lib/heroBestWindow';
import {
  getTopNowCards,
  isConditionDriven,
  TOP_NOW_SPORTS,
  type HomepageSpotData,
} from '@/lib/homepageSport';
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

describe('pickHeroBestWindow no modo adaptativo (sports)', () => {
  it('limita o banner aos desportos de «A bombar agora»', () => {
    const sup = row('lagoa', {
      lat: 39.4,
      lon: -9.2,
      sports: ['sup', 'surf'],
      today: { sup: { start: 8, end: 12, score: 95 }, surf: { start: 9, end: 11, score: 62 } },
    });
    expect(pickHeroBestWindow([sup], 'all', 'continent', NOW)?.window.sport).toBe('sup');
    expect(
      pickHeroBestWindow([sup], 'all', 'continent', NOW, TOP_NOW_SPORTS)?.window,
    ).toEqual({ start: 9, end: 11, score: 62, sport: 'surf' });
  });
});

describe('isConditionDriven', () => {
  it('default (não escolhido) e «Todos» seguem as condições; desporto escolhido não', () => {
    expect(isConditionDriven('surf', false)).toBe(true);
    expect(isConditionDriven('all', true)).toBe(true);
    expect(isConditionDriven('surf', true)).toBe(false);
    expect(isConditionDriven('kitesurf', true)).toBe(false);
  });
});

describe('getTopNowCards — modo adaptativo (default / «Todos»)', () => {
  const surf = (slug: string, n: number) =>
    row(slug, { lat: 39, lon: -9.4, sports: ['surf'], scores: { surf: n } });
  const kite = (slug: string, n: number) =>
    row(slug, { lat: 41, lon: -8.8, sports: ['kitesurf'], scores: { kitesurf: n } });
  const wind = (slug: string, n: number) =>
    row(slug, { lat: 38.6, lon: -9.3, sports: ['windsurf'], scores: { windsurf: n } });

  it('dia de ondulação → só surf, ≤2 por desporto, ignora < Bom', () => {
    const cards = getTopNowCards(
      [surf('s1', 90), surf('s2', 80), surf('s3', 75), kite('k-fraco', 40)],
      'all',
    );
    expect(cards.map((c) => c.data.spot.slug)).toEqual(['s1', 's2']);
    expect(cards.every((c) => c.sport === 'surf')).toBe(true);
  });

  it('dia de vento → kite (e windsurf), sem surf fraco', () => {
    const cards = getTopNowCards(
      [surf('s-fraco', 35), kite('k1', 95), kite('k2', 88), kite('k3', 82), wind('w1', 70)],
      'all',
    );
    expect(cards.map((c) => `${c.sport}:${c.data.spot.slug}`)).toEqual([
      'kitesurf:k1',
      'kitesurf:k2',
      'windsurf:w1',
    ]);
  });

  it('dia misto → surf e kite, até 4 cards, ≤2 por desporto, ordenados por score', () => {
    const cards = getTopNowCards(
      [surf('s1', 92), surf('s2', 90), surf('s3', 89), kite('k1', 70), kite('k2', 65), kite('k3', 64)],
      'all',
    );
    expect(cards).toHaveLength(4);
    expect(cards.map((c) => `${c.sport}:${c.data.spot.slug}`)).toEqual([
      'surf:s1',
      'surf:s2',
      'kitesurf:k1',
      'kitesurf:k2',
    ]);
    const perSport = cards.reduce<Record<string, number>>((acc, c) => {
      acc[c.sport] = (acc[c.sport] ?? 0) + 1;
      return acc;
    }, {});
    expect(Math.max(...Object.values(perSport))).toBeLessThanOrEqual(2);
  });

  it('dia misto com surf+bodyboard fortes não esconde o kite', () => {
    const sb = (slug: string, n: number) =>
      row(slug, {
        lat: 39,
        lon: -9.4,
        sports: ['surf', 'bodyboard'],
        scores: { surf: n, bodyboard: n - 1 },
      });
    const cards = getTopNowCards([sb('a', 95), sb('b', 93), sb('c', 91), kite('k1', 66)], 'all');
    expect(cards.some((c) => c.sport === 'kitesurf')).toBe(true);
    // um spot nunca ocupa dois cards (surf + bodyboard do mesmo pico)
    const slugs = cards.map((c) => c.data.spot.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('nada a bombar → lista vazia (mantém o estado vazio)', () => {
    expect(getTopNowCards([surf('s', 40), kite('k', 55)], 'all')).toEqual([]);
  });

  it('respeita maxCards', () => {
    expect(getTopNowCards([surf('s1', 90), kite('k1', 80), wind('w1', 75)], 'all', 2)).toHaveLength(2);
  });
});

describe('getTopNowCards — desporto escolhido', () => {
  const kiteA = row('kite-a', { lat: 41, lon: -8.8, sports: ['kitesurf'], scores: { kitesurf: 100 } });
  const kiteB = row('kite-b', { lat: 40, lon: -8.9, sports: ['kitesurf'], scores: { kitesurf: 85 } });
  const kiteWeak = row('kite-c', { lat: 40, lon: -8.9, sports: ['kitesurf'], scores: { kitesurf: 30 } });

  it('com Kitesurf mostra só spots de kite a bombar, ordenados (mesmo com surf épico)', () => {
    const cards = getTopNowCards([azores, kiteWeak, kiteB, kiteA], 'kitesurf');
    expect(cards.map((c) => c.data.spot.slug)).toEqual(['kite-a', 'kite-b']);
    expect(cards.every((c) => c.sport === 'kitesurf')).toBe(true);
  });

  it('com Surf mostra até 4 spots de surf, sem kite', () => {
    const surfs = [95, 90, 85, 80, 75].map((n, i) =>
      row(`s${i}`, { lat: 39, lon: -9.4, sports: ['surf'], scores: { surf: n } }),
    );
    const cards = getTopNowCards([...surfs, kiteA], 'surf');
    expect(cards).toHaveLength(4);
    expect(cards.every((c) => c.sport === 'surf')).toBe(true);
  });

  it('respeita maxCards', () => {
    expect(getTopNowCards([kiteA, kiteB], 'kitesurf', 1)).toHaveLength(1);
  });
});
