import { describe, expect, it } from 'vitest';
import {
  bestClusterScore,
  clusterLabel,
  createClusterIconFunction,
} from '@/components/spots/MapClusterIcon';

interface DivIconOpts {
  className: string;
  html: string;
  iconSize: [number, number];
  iconAnchor: [number, number];
}

// L.divIcon falso — captura as opções sem DOM.
const fakeL = {
  divIcon: (opts: DivIconOpts) => opts,
} as unknown as typeof import('leaflet');

const cluster = (markers: { spotScore?: number }[]) =>
  ({ getAllChildMarkers: () => markers }) as never;

function iconHtml(markers: { spotScore?: number }[], opts = {}): string {
  const fn = createClusterIconFunction(fakeL, { locale: 'pt', ...opts });
  return (fn(cluster(markers)) as unknown as DivIconOpts).html;
}

describe('bestClusterScore', () => {
  it('devolve null sem filhos', () => {
    expect(bestClusterScore([])).toBeNull();
  });

  it('devolve null quando nenhum filho tem spotScore', () => {
    expect(bestClusterScore([{}, {}, {}])).toBeNull();
  });

  it('um só filho com score → esse score', () => {
    expect(bestClusterScore([{ spotScore: 73 }, {}])).toBe(73);
  });

  it('máximo dos scores presentes, ignorando os sem score', () => {
    expect(bestClusterScore([{ spotScore: 41 }, {}, { spotScore: 88 }, { spotScore: 55 }])).toBe(88);
  });

  it('empates → o valor empatado', () => {
    expect(bestClusterScore([{ spotScore: 80 }, { spotScore: 80 }, { spotScore: 12 }])).toBe(80);
  });
});

describe('clusterLabel', () => {
  it('inclui melhor score e contagem (pt)', () => {
    expect(clusterLabel(12, 80, 'pt', 'spots')).toBe('Melhor score 80 · 12 spots nesta zona — ampliar');
  });

  it('en/es/de/fr', () => {
    expect(clusterLabel(12, 80, 'en', 'spots')).toContain('Best score 80 · 12 spots');
    expect(clusterLabel(12, 80, 'es', 'spots')).toContain('Mejor score 80 · 12 spots');
    expect(clusterLabel(12, 80, 'de', 'spots')).toContain('Bester Score 80 · 12 Spots');
    expect(clusterLabel(12, 80, 'fr', 'spots')).toContain('Meilleur score 80 · 12 spots');
  });

  it('sem score cai na etiqueta só de contagem', () => {
    expect(clusterLabel(7, null, 'pt', 'spots')).toBe('7 spots nesta zona — ampliar');
  });

  it('places nunca mostra score', () => {
    expect(clusterLabel(9, null, 'pt', 'places')).toBe('9 locais nesta zona — ampliar');
    expect(clusterLabel(9, 80, 'en', 'places')).toBe('9 places in this area — zoom in');
  });

  it('locale desconhecido cai em en', () => {
    expect(clusterLabel(3, 50, 'ja', 'spots')).toContain('Best score 50 · 3 spots');
  });
});

describe('createClusterIconFunction — html', () => {
  it('mostra o melhor score (não a contagem) como número principal', () => {
    const html = iconHtml([{ spotScore: 41 }, { spotScore: 92 }, { spotScore: 55 }], { simple: true });
    expect(html).toContain('data-cluster-score');
    expect(html).toMatch(/<span data-cluster-score[^>]*>92<\/span>/);
    expect(html).toContain('data-cluster-count');
    expect(html).toMatch(/<span data-cluster-count[^>]*>3<\/span>/);
  });

  it('sem scores mantém a contagem como número principal e sem badge', () => {
    const html = iconHtml([{}, {}], { simple: true });
    expect(html).not.toContain('data-cluster-score');
    expect(html).not.toContain('data-cluster-count');
    expect(html).toMatch(/>\s*2\s*<\/div>/);
  });

  it('variante com arcos também mostra score + badge', () => {
    const fn = createClusterIconFunction(fakeL, { locale: 'pt', simple: false });
    const html = (fn(cluster([{ spotScore: 70 }, { spotScore: 30 }])) as unknown as DivIconOpts).html;
    expect(html).toContain('data-cluster-score');
    expect(html).toContain('>70</text>');
    expect(html).toContain('data-cluster-count');
  });

  it('kind places ignora spotScore mesmo que exista', () => {
    const fn = createClusterIconFunction(fakeL, { locale: 'pt', kind: 'places' });
    const html = (fn(cluster([{ spotScore: 90 }, {}])) as unknown as DivIconOpts).html;
    expect(html).not.toContain('data-cluster-score');
    expect(html).toContain('2 locais nesta zona — ampliar');
  });
});
