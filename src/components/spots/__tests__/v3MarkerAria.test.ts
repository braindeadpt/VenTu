/**
 * Nome acessível do marcador v3 do /mapa quando o papel muda.
 *
 * O representante de um grupo de colisão chama-se «Nazaré · Mais 36 spots
 * perto — ampliar» (o badge «+N» é aria-hidden). Ao desagrupar (ou ao ampliar)
 * o marcador fica sozinho e `applyV3LayoutIcon` troca o ícone com `setIcon` —
 * o DivIcon do Leaflet reaproveita o MESMO <div>, por isso o aria-label que o
 * `add` escreveu ficava agarrado ao grupo que já não existe. Apanhado pelo e2e
 * map-explore-sheet «linha e marcador partilham o score» de madrugada (a
 * Nazaré do stub era a melhor do grupo porque os vizinhos estavam a 0).
 */
import { describe, expect, it } from 'vitest';
import { applyV3LayoutIcon, createV3SpotMarker } from '../mapMarkers';
import type { MapSpotData } from '../mapSpotData';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';

const SPORTS: SportType[] = ['surf', 'kitesurf', 'windsurf', 'wakeboard', 'bodyboard', 'sup', 'foil'];
const MORE_PT = 'Mais {n} spots perto — ampliar';

function makeData(score: number): MapSpotData {
  const spot = {
    id: 'nazare',
    slug: 'nazare',
    name: 'Nazaré',
    nameEn: 'Nazaré',
    region: 'Oeste',
    regionEn: 'West',
    lat: 39.6,
    lon: -9.07,
    type: 'big-wave',
    difficulty: 'advanced',
    bestWind: 'E',
    bestSwell: 'W',
    coastOrientation: 270,
    description: 'x',
    descriptionEn: 'x',
    facilities: [],
    hazards: [],
  } as unknown as Spot;
  const base: SportScore = { score, rating: 'Fraco', ratingEn: 'Poor', factors: [], factorsEn: [], primaryFactor: 'Ondas' };
  return {
    spot,
    conditions: { windSpeed: 6, windDirection: 0, waveHeight: 1.5, wavePeriod: 10 } as unknown as MapSpotData['conditions'],
    allScores: Object.fromEntries(SPORTS.map((s) => [s, { ...base }])) as Record<SportType, SportScore>,
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

/** L falso: o marcador guarda o ícone e devolve o MESMO elemento depois do setIcon (como o DivIcon). */
function fakeLeaflet() {
  return {
    divIcon: (opts: unknown) => opts,
    marker: (_latlng: [number, number], opts: { icon: unknown; zIndexOffset?: number }) => {
      const handlers = new Map<string, () => void>();
      let el: FakeEl | null = null;
      return {
        options: opts,
        handlers,
        on(ev: string, fn: () => void) {
          handlers.set(ev, fn);
          return this;
        },
        getElement: () => el,
        attach(e: FakeEl | null) {
          el = e;
        },
        setIcon(icon: unknown) {
          opts.icon = icon;
          return this;
        },
        setZIndexOffset(z: number) {
          opts.zIndexOffset = z;
          return this;
        },
      };
    },
    DomEvent: { stopPropagation: () => undefined },
  } as unknown as typeof import('leaflet');
}

type FakeMarker = {
  handlers: Map<string, () => void>;
  attach: (e: FakeEl | null) => void;
};

const GRUPO = { id: 'nazare', kind: 'full' as const, memberIds: ['nazare', ...Array.from({ length: 36 }, (_, i) => `v${i}`)] };
const SO = { id: 'nazare', kind: 'full' as const, memberIds: ['nazare'] };

function cria(L: typeof import('leaflet'), layout: typeof GRUPO | typeof SO, locale = 'pt', more = MORE_PT) {
  const data = makeData(20);
  const marker = createV3SpotMarker(L, data, layout, {
    selectedSport: 'surf',
    locale,
    showWindTick: false,
    reducedMotion: true,
    onOpen: () => undefined,
    moreAriaTemplate: more,
  });
  return { data, marker, fake: marker as unknown as FakeMarker };
}

describe('marcador v3 — o nome acessível acompanha o papel', () => {
  it('representante do grupo → sozinho: o nome perde a contagem (mesmo <div>)', () => {
    const L = fakeLeaflet();
    const { data, marker, fake } = cria(L, GRUPO);
    const el = new FakeEl();
    fake.attach(el);
    fake.handlers.get('add')?.();
    expect(el.attrs.get('aria-label')).toBe('Nazaré · Mais 36 spots perto — ampliar');

    applyV3LayoutIcon(L, marker, data, SO, { selectedSport: 'surf', showWindTick: false, moreAriaTemplate: MORE_PT });
    expect(el.attrs.get('aria-label')).toBe('Nazaré');
    expect(el.attrs.get('data-spot-id')).toBe('nazare');
  });

  it('sozinho → representante e → ponto: contagem nova; o ponto fica só com o nome', () => {
    const L = fakeLeaflet();
    const { data, marker, fake } = cria(L, SO);
    const el = new FakeEl();
    fake.attach(el);
    fake.handlers.get('add')?.();
    expect(el.attrs.get('aria-label')).toBe('Nazaré');

    applyV3LayoutIcon(L, marker, data, { ...GRUPO, memberIds: GRUPO.memberIds.slice(0, 4) }, {
      selectedSport: 'surf',
      showWindTick: false,
      moreAriaTemplate: MORE_PT,
    });
    expect(el.attrs.get('aria-label')).toBe('Nazaré · Mais 3 spots perto — ampliar');

    applyV3LayoutIcon(L, marker, data, { id: 'nazare', kind: 'dot', memberIds: [] }, {
      selectedSport: 'surf',
      showWindTick: false,
      moreAriaTemplate: MORE_PT,
    });
    expect(el.attrs.get('aria-label')).toBe('Nazaré');
  });

  it('mudança de papel fora do mapa: o próximo `add` (elemento novo) escreve o nome actual', () => {
    const L = fakeLeaflet();
    const { data, marker, fake } = cria(L, GRUPO);
    applyV3LayoutIcon(L, marker, data, SO, { selectedSport: 'surf', showWindTick: false, moreAriaTemplate: MORE_PT });
    const el = new FakeEl();
    fake.attach(el);
    fake.handlers.get('add')?.();
    expect(el.attrs.get('aria-label')).toBe('Nazaré');
  });

  it('noite: o nome mantém «noite, sem nota» quando o grupo se desfaz', () => {
    const L = fakeLeaflet();
    const data = makeData(20);
    const marker = createV3SpotMarker(L, data, GRUPO, {
      selectedSport: 'surf',
      locale: 'en',
      showWindTick: false,
      reducedMotion: true,
      onOpen: () => undefined,
      moreAriaTemplate: '{n} more spots nearby — zoom in',
      scoreOverride: null,
    });
    const fake = marker as unknown as FakeMarker;
    const el = new FakeEl();
    fake.attach(el);
    fake.handlers.get('add')?.();
    expect(el.attrs.get('aria-label')).toBe('Nazaré · night, no score · 36 more spots nearby — zoom in');
    applyV3LayoutIcon(L, marker, data, SO, {
      selectedSport: 'surf',
      showWindTick: false,
      moreAriaTemplate: '{n} more spots nearby — zoom in',
      scoreOverride: null,
    });
    expect(el.attrs.get('aria-label')).toBe('Nazaré · night, no score');
  });
});
