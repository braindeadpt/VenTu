/**
 * Estado «noite» do /mapa (#218 D3, opção 1): numa frame em que o motor v6
 * não dá nota (scoreAtHour → null) em kitesurf/surf/big-wave, marcador,
 * lista, cluster, popup e pré-visualização mostram «noite» sem número, no
 * fill v6 `noite` (#56677B).
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MAP_NIGHT_FILL,
  MAP_NIGHT_INK,
  mapNightAppliesTo,
  mapNightCopy,
} from '@/lib/mapNight';
import { V6_BANDAS } from '@/lib/v6Tokens';
import { buildWindRingMarkerHtml, buildWindRingMarkerSvg } from '@/lib/mapWindArrow';
import { getTranslation } from '@/lib/i18n';
import { spotV6Copy } from '@/lib/translations/spotPage/v6';
import {
  MAP_NIGHT_RANK,
  getBestScore,
  getMapRankScore,
  isMapNight,
  type MapSpotData,
} from '../mapSpotData';
import {
  buildMarkerCacheKey,
  buildV3DotIcon,
  buildV3MarkerIcon,
  contrastRatio,
  createV3SpotMarker,
  planMarkerLayout,
} from '../mapMarkers';
import {
  bestClusterScore,
  clusterLabel,
  createClusterIconFunction,
  isNightCluster,
} from '../MapClusterIcon';
import { MapNightTile } from '../map/components/MapSpotList';
import { SpotCardContent } from '../MapSpotPreview';
import { renderSpotPopup } from '../SpotPopupContent';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';

interface DivIconOpts {
  className: string;
  html: string;
  iconSize: [number, number];
  iconAnchor: [number, number];
}

const SPORTS: SportType[] = ['surf', 'kitesurf', 'windsurf', 'wakeboard', 'bodyboard', 'sup', 'foil'];

function makeSpot(overrides: Partial<Spot> = {}): Spot {
  return {
    id: 'guincho',
    slug: 'guincho',
    name: 'Guincho',
    nameEn: 'Guincho',
    region: 'Lisboa',
    regionEn: 'Lisbon',
    lat: 38.73,
    lon: -9.47,
    type: 'surf',
    difficulty: 'advanced',
    bestWind: 'N',
    bestSwell: 'NW',
    coastOrientation: 270,
    description: 'x',
    descriptionEn: 'x',
    facilities: [],
    hazards: [],
    ...overrides,
  };
}

function makeScores(score: number): Record<SportType, SportScore> {
  const base: SportScore = {
    score,
    rating: 'Bom',
    ratingEn: 'Good',
    factors: [],
    factorsEn: [],
    primaryFactor: 'Ondas',
  };
  return Object.fromEntries(SPORTS.map((s) => [s, { ...base }])) as Record<SportType, SportScore>;
}

function makeData(score = 72, spot: Partial<Spot> = {}): MapSpotData {
  return {
    spot: makeSpot(spot),
    conditions: {
      windSpeed: 6,
      windDirection: 0,
      waveHeight: 1.5,
      wavePeriod: 10,
      swellHeight: 1.5,
      swellPeriod: 10,
      waterTemp: 17,
    } as unknown as MapSpotData['conditions'],
    allScores: makeScores(score),
  };
}

class FakeEl {
  attrs = new Map<string, string>();
  style: Record<string, string> = {};
  hasAttribute(k: string) {
    return this.attrs.has(k);
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
}

// L falso — captura as opções do divIcon/marker sem DOM.
function fakeLeaflet() {
  return {
    divIcon: (opts: DivIconOpts) => opts,
    marker: (latlng: [number, number], opts: { icon: DivIconOpts; zIndexOffset?: number }) => {
      const handlers = new Map<string, (e?: unknown) => void>();
      let el: FakeEl | null = null;
      return {
        latlng,
        options: opts,
        handlers,
        on(ev: string, fn: (e?: unknown) => void) {
          handlers.set(ev, fn);
          return this;
        },
        getElement: () => el,
        attach(e: FakeEl) {
          el = e;
        },
      };
    },
    DomEvent: { stopPropagation: () => undefined },
  } as unknown as typeof import('leaflet');
}

type FakeMarker = {
  spotNight?: boolean;
  spotScore?: number;
  options: { icon: DivIconOpts };
  handlers: Map<string, () => void>;
  attach: (e: FakeEl) => void;
};

function v3Marker(scoreOverride: number | null | undefined, locale = 'pt', sport: 'surf' | 'kitesurf' = 'surf') {
  return createV3SpotMarker(fakeLeaflet(), makeData(72), { id: 'guincho', kind: 'full', memberIds: ['guincho'] }, {
    selectedSport: sport,
    locale,
    showWindTick: false,
    reducedMotion: true,
    onOpen: () => undefined,
    scoreOverride,
  }) as unknown as FakeMarker;
}

describe('mapNight — regra e cópia', () => {
  it('só kitesurf, surf e big-wave mostram noite; «Todas» (best, D5) e motor antigo não', () => {
    expect(mapNightAppliesTo('kitesurf')).toBe(true);
    expect(mapNightAppliesTo('surf')).toBe(true);
    expect(mapNightAppliesTo('big-wave')).toBe(true);
    expect(mapNightAppliesTo('all')).toBe(false);
    expect(mapNightAppliesTo('bodyboard')).toBe(false);
    expect(mapNightAppliesTo('windsurf')).toBe(false);
  });

  it('fill = token v6 `noite` (#56677B, régua do spot) e texto branco AA', () => {
    expect(MAP_NIGHT_FILL).toBe('#56677B');
    expect(MAP_NIGHT_FILL).toBe(V6_BANDAS.noite.c);
    expect(MAP_NIGHT_INK).toBe('#FFFFFF');
    expect(contrastRatio(MAP_NIGHT_FILL, MAP_NIGHT_INK)).toBeGreaterThanOrEqual(4.5);
  });

  it('i18n PT/EN: «noite» / «noite, sem nota» e «night» / «night, no score»', () => {
    expect(mapNightCopy('pt')).toEqual({ label: 'noite', aria: 'noite, sem nota' });
    expect(mapNightCopy('en')).toEqual({ label: 'night', aria: 'night, no score' });
    // locale desconhecido cai no EN
    expect(mapNightCopy('it').label).toBe('night');
    // as mesmas chaves no dicionário t.mapUiMarkers (lista e pré-visualização)
    expect(getTranslation('pt').mapUiMarkers.night).toBe('noite');
    expect(getTranslation('pt').mapUiMarkers.nightAria).toBe('noite, sem nota');
    expect(getTranslation('en').mapUiMarkers.night).toBe('night');
    expect(getTranslation('en').mapUiMarkers.nightAria).toBe('night, no score');
    // «Perto daqui» (cópia v6 do spot)
    expect(spotV6Copy('pt').pertoNoite).toBe('noite');
    expect(spotV6Copy('pt').pertoNoiteAria).toBe('noite, sem nota');
    expect(spotV6Copy('en').pertoNoite).toBe('night');
    expect(spotV6Copy('en').pertoNoiteAria).toBe('night, no score');
  });
});

describe('mapSpotData — score da hora com noite', () => {
  const d = makeData(72);
  it('null = noite; número e undefined não', () => {
    expect(isMapNight(null)).toBe(true);
    expect(isMapNight(0)).toBe(false);
    expect(isMapNight(undefined)).toBe(false);
  });

  it('rank de noite fica abaixo de qualquer nota (incl. 0)', () => {
    expect(getMapRankScore(d, 'surf', null)).toBe(MAP_NIGHT_RANK);
    expect(MAP_NIGHT_RANK).toBeLessThan(0);
    expect(getMapRankScore(d, 'surf', 0)).toBe(0);
    expect(getMapRankScore(d, 'surf', 40)).toBe(40);
    expect(getMapRankScore(d, 'surf', undefined)).toBe(72);
  });

  it('getBestScore com null não inventa número: cai no ao vivo', () => {
    expect(getBestScore(d, 'surf', null)).toBe(72);
    expect(getBestScore(d, 'surf', 30)).toBe(30);
  });
});

describe('marcador v3 (/mapa) — noite', () => {
  const L = fakeLeaflet();
  it('disco no fill noite, lua, sem número nem data-spot-score', () => {
    const icon = buildV3MarkerIcon(L, { spotId: 'guincho', score: MAP_NIGHT_RANK, night: true }) as unknown as DivIconOpts;
    expect(icon.html).toContain(`background:${MAP_NIGHT_FILL}`);
    expect(icon.html).toContain('data-spot-night="true"');
    expect(icon.html).not.toContain('data-spot-score');
    expect(icon.html).toContain('<svg');
    const inner = icon.html.match(/<span class="v3in"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '';
    expect(inner).not.toMatch(/>\s*-?\d+\s*</);
  });

  it('sem noite o marcador fica igual (score + data-spot-score)', () => {
    const icon = buildV3MarkerIcon(L, { spotId: 'guincho', score: 72 }) as unknown as DivIconOpts;
    expect(icon.html).toContain('data-spot-score="72"');
    expect(icon.html).not.toContain('data-spot-night');
    expect(icon.html).not.toContain(MAP_NIGHT_FILL);
  });

  it('ponto de colisão de noite no fill noite', () => {
    const dot = buildV3DotIcon(L, 'guincho', MAP_NIGHT_RANK, true) as unknown as DivIconOpts;
    expect(dot.html).toContain(`background:${MAP_NIGHT_FILL}`);
    expect(dot.html).toContain('data-spot-night="true"');
    expect(dot.html).not.toContain('data-spot-score');
  });

  it('createV3SpotMarker: spotNight, sem spotScore, aria «Nome · noite, sem nota»', () => {
    const m = v3Marker(null);
    expect(m.spotNight).toBe(true);
    expect(m.spotScore).toBeUndefined();
    expect(m.options.icon.html).toContain('data-spot-night="true"');
    const el = new FakeEl();
    m.attach(el);
    m.handlers.get('add')?.();
    expect(el.attrs.get('aria-label')).toBe('Guincho · noite, sem nota');
  });

  it('EN: aria «night, no score»', () => {
    const m = v3Marker(null, 'en', 'kitesurf');
    const el = new FakeEl();
    m.attach(el);
    m.handlers.get('add')?.();
    expect(el.attrs.get('aria-label')).toBe('Guincho · night, no score');
  });

  it('com número na frame o marcador mostra esse número (sem noite)', () => {
    const m = v3Marker(40);
    expect(m.spotNight).toBeUndefined();
    expect(m.spotScore).toBe(40);
    expect(m.options.icon.html).toContain('data-spot-score="40"');
  });

  it('cache key muda entre noite e ao vivo (o marcador é recriado)', () => {
    const data = makeData(72);
    const night = buildMarkerCacheKey(data, 'surf', false, 'pt', false, null, null);
    const live = buildMarkerCacheKey(data, 'surf', false, 'pt', false, null, undefined);
    expect(night).not.toBe(live);
    expect(night).toContain('night');
  });

  it('colisão: no grupo, o representante é sempre um spot com nota', () => {
    const out = planMarkerLayout(
      [
        { id: 'noite', x: 0, y: 0, score: MAP_NIGHT_RANK },
        { id: 'fraco', x: 10, y: 0, score: 0 },
      ],
      40,
    );
    expect(out.find((e) => e.kind === 'full')?.id).toBe('fraco');
  });
});

describe('pin clássico (buildPinSvg) — noite', () => {
  it('sem <text> (sem número), fill noite e lua', () => {
    const svg = buildWindRingMarkerSvg(-1, 'rgb(0,0,0)', 0, 10, false, 270, mapNightCopy('pt'));
    expect(svg).toContain(`fill="${MAP_NIGHT_FILL}"`);
    expect(svg).toContain('ventu-marker-pin--night');
    expect(svg).not.toContain('<text');
  });

  it('wrap com data-spot-night, sem data-spot-score, title com «noite, sem nota»', () => {
    const html = buildWindRingMarkerHtml(-1, 'rgb(0,0,0)', 0, 10, false, 'pt', 270, null, mapNightCopy('pt'));
    expect(html).toContain('data-spot-night="true"');
    expect(html).not.toContain('data-spot-score');
    expect(html).toContain('title="noite, sem nota"');
  });

  it('sem noite: igual a antes (número no <text>)', () => {
    const html = buildWindRingMarkerHtml(72, 'rgb(0,0,0)', 0, 10, false, 'pt', 270, null);
    expect(html).toContain('data-spot-score="72"');
    expect(html).toContain('<text');
  });
});

describe('cluster — noite', () => {
  const fakeL = { divIcon: (opts: DivIconOpts) => opts } as unknown as typeof import('leaflet');
  const html = (markers: { spotScore?: number; spotNight?: boolean }[], simple = false) =>
    (createClusterIconFunction(fakeL, { locale: 'pt', simple })({
      getAllChildMarkers: () => markers,
    } as never) as unknown as DivIconOpts).html;

  it('isNightCluster só com TODOS os filhos de noite', () => {
    expect(isNightCluster([])).toBe(false);
    expect(isNightCluster([{ spotNight: true }, { spotNight: true }])).toBe(true);
    expect(isNightCluster([{ spotNight: true }, { spotScore: 30 }])).toBe(false);
  });

  it('todos de noite → estilo noite, sem número, nome «noite, sem nota · N spots…»', () => {
    for (const simple of [false, true]) {
      const h = html([{ spotNight: true }, { spotNight: true }, { spotNight: true }], simple);
      expect(h).toContain('data-cluster-night="true"');
      expect(h).toContain(MAP_NIGHT_FILL);
      expect(h).not.toContain('data-cluster-score');
      expect(h).toContain('noite, sem nota · 3 spots nesta zona — ampliar');
    }
  });

  it('misto → melhor numérico dos que têm nota (a noite não conta)', () => {
    const markers = [{ spotNight: true }, { spotScore: 30 }, { spotScore: 55 }, { spotNight: true }];
    expect(bestClusterScore(markers)).toBe(55);
    const h = html(markers);
    expect(h).not.toContain('data-cluster-night');
    expect(h).toContain('data-cluster-score');
    expect(h).toMatch(/>\s*6\s*</);
    // fatia própria no donut (não conta como «fraco»)
    expect(h).toContain(`stroke="${MAP_NIGHT_FILL}"`);
  });

  it('clusterLabel EN de noite; locais do directório nunca ficam «noite»', () => {
    expect(clusterLabel(4, null, 'en', 'spots', true)).toBe('night, no score · 4 spots in this area — zoom in');
    expect(clusterLabel(4, null, 'pt', 'places', true)).toBe('4 locais nesta zona — ampliar');
  });
});

describe('lista / peek — mosaico «noite»', () => {
  it('MapNightTile: «noite», fill noite, role=img com «noite, sem nota»', () => {
    const t = getTranslation('pt').mapUiMarkers;
    const h = renderToStaticMarkup(
      createElement(MapNightTile, { night: { label: t.night, aria: t.nightAria }, className: 'h-11 w-11' }),
    );
    expect(h).toContain('>noite<');
    expect(h).toContain('role="img"');
    expect(h).toContain('aria-label="noite, sem nota"');
    expect(h).toContain('background:#56677B');
    expect(h).toContain('data-row-night="true"');
  });

  it('EN «night»', () => {
    const t = getTranslation('en').mapUiMarkers;
    const h = renderToStaticMarkup(createElement(MapNightTile, { night: { label: t.night, aria: t.nightAria } }));
    expect(h).toContain('>night<');
    expect(h).toContain('aria-label="night, no score"');
  });
});

describe('popup — noite', () => {
  const base = {
    spot: makeSpot(),
    locale: 'pt',
    detailHref: '/pt/spots/guincho/',
    allScores: makeScores(72),
    swellHeight: '1.5',
    swellPeriod: '10',
    windKnots: '12',
    windDirection: 'N',
    waterTemp: '17',
    wavePowerKw: '10',
  };
  it('«noite» no lugar da nota', () => {
    const h = renderSpotPopup({ ...base, night: mapNightCopy('pt') });
    expect(h).toContain('data-popup-night="true"');
    expect(h).toContain('aria-label="noite, sem nota"');
    expect(h).not.toContain('>7</span>');
  });
  it('sem noite: a nota de sempre', () => {
    const h = renderSpotPopup(base);
    expect(h).not.toContain('data-popup-night');
    expect(h).toContain('>7</span>');
  });
});

describe('pré-visualização (cartão/sheet) — noite', () => {
  const props = { data: makeData(72), locale: 'pt', highlightSport: 'surf' as const, hoursFrame: 3, hourLabel: '23h' };
  it('«noite» no lugar da nota grande, sem banda', () => {
    const h = renderToStaticMarkup(createElement(SpotCardContent, { ...props, scoreOverride: null }));
    expect(h).toContain('data-card-night="true"');
    expect(h).toContain('aria-label="noite, sem nota"');
    expect(h).toContain('>noite<');
    expect(h).not.toContain('data-card-score');
  });
  it('com número na frame: a nota dessa hora', () => {
    const h = renderToStaticMarkup(createElement(SpotCardContent, { ...props, scoreOverride: 40 }));
    expect(h).not.toContain('data-card-night');
    expect(h).toContain('data-card-score="40"');
  });
});
