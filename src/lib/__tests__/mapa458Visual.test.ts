import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { windV6Alpha, windV6LegendStops } from '@/lib/mapWindV6';

/**
 * #458 · fecho visual do /mapa na pele v6: selector «Vento | Ondulação | Nenhum», rampa da
 * legenda do vento, legenda do sheet mobile, cartão de 48 h no «half» e paisagem 844×390.
 */
const ler = (f: string) => fs.readFileSync(path.resolve(f), 'utf8');
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const pele = semComentarios(ler('src/styles/mapa-pele-v6.css'));
const globais = semComentarios(ler('src/app/globals.css'));

/** Corpo da regra cujo seletor (um dos da lista) é exactamente `sel`. */
function corpo(css: string, sel: string): string | null {
  for (const regra of css.split('}')) {
    const [seletores, c = ''] = regra.split('{');
    if (seletores.split(',').some((s) => s.trim() === sel)) return c;
  }
  return null;
}

describe('#458 · selector do mar na pele v6', () => {
  it('vidro v6 no grupo', () => {
    const c = corpo(pele, "[data-pele='v6'] [data-map-sea-mode]");
    expect(c).toMatch(/background:rgba\(3,14,24,\.9\)/);
    expect(c).toMatch(/backdrop-filter:blur\(14px\)/);
  });
  it('opções em Barlow Condensed 800 itálico, caixa alta', () => {
    const c = corpo(pele, "[data-pele='v6'] [data-map-sea-mode-option]");
    expect(c).toMatch(/font:800 italic 17px\/1 var\(--disp\)/);
    expect(c).toMatch(/text-transform:uppercase/);
  });
  it('activa no sol com texto abismo', () => {
    const c = corpo(pele, "[data-pele='v6'] [data-map-sea-mode-option][aria-checked='true']");
    expect(c).toMatch(/background:var\(--sol\)/);
    expect(c).toMatch(/color:var\(--abismo\)/);
  });
});

describe('#458 · rampa do vento v6', () => {
  it('segue o topo da escala', () => {
    expect(windV6LegendStops(30).map((s) => s[0])).toEqual([0, 5, 10, 15, 20, 25, 30]);
    expect(windV6LegendStops(40).at(-1)?.[0]).toBe(40);
  });
  it('é monocromática (gelo → espuma), sem arco-íris, e clareia com a força', () => {
    const stops = windV6LegendStops(40);
    const lum = stops.map(([, [r, g, b]]) => r + g + b);
    for (let i = 1; i < lum.length; i++) expect(lum[i]).toBeGreaterThanOrEqual(lum[i - 1]);
    for (const [, [r, g, b]] of stops) {
      // gelo e espuma têm o azul ≥ verde ≥ vermelho; o arco-íris antigo não
      expect(b).toBeGreaterThanOrEqual(g);
      expect(g).toBeGreaterThanOrEqual(r);
    }
  });
  it('compõe o alfa do traço sobre o abismo', () => {
    const [, c0] = windV6LegendStops(30)[0];
    const a = windV6Alpha(0);
    expect(c0[0]).toBe(Math.round(3 + (127 - 3) * a));
  });
  it('a legenda usa a rampa v6 só com a pele', () => {
    const src = ler('src/components/spots/SeaFieldLegend.tsx');
    expect(src).toMatch(/v6 \? windV6LegendStops\(top\) : WIND_KT_STOPS/);
    expect(ler('src/components/spots/MapLegend.tsx')).toMatch(/<WindKtLegend[^>]*v6=\{peleV6 != null\}/);
  });
});

describe('#458 · legenda do sheet mobile', () => {
  it('MapExploreZoneView passa a pele à legenda embutida', () => {
    const src = ler('src/components/spots/map/zones/MapExploreZoneView.tsx');
    expect(src).toMatch(/embedded\s+v6=\{pele === 'v6'/);
  });
  it('a legenda embutida usa a escala em mosaico com a pele', () => {
    const src = ler('src/components/spots/MapLegend.tsx');
    expect(src).toMatch(/const peleV6 = chrome\?\.v6 \?\? \(embedded \? v6 : null\)/);
    expect(src).toMatch(/peleV6 \? \(\s*<ScoreScaleV6/);
  });
});

describe('#458 · cartão de 48 h no «half» e paisagem', () => {
  it('o cartão flutuante de 48 h continua visível com o sheet a meio (é o trilho do half)', () => {
    expect(corpo(globais, "[data-map-fullscreen='true']:has([data-explore-sheet='half']) .map-scrub-wrap")).toBeNull();
  });
  it('em ecrãs baixos o painel rola e a lista guarda altura', () => {
    const src = ler('src/components/spots/map/components/MapSpotPanel.tsx');
    expect(src).toMatch(/\[@media\(max-height:520px\)\]:overflow-y-auto/);
    expect(src).toMatch(/data-map-panel-lista[\s\S]{0,200}\[@media\(max-height:520px\)\]:min-h-\[240px\]/);
  });
  it('o cartão do spot ganha teto e scroll quando não cabe, sem a seta', () => {
    const src = ler('src/components/spots/MapSpotPreview.tsx');
    expect(src).toMatch(/const avail = Math\.max\(160, Math\.floor\(cr\.height - 72\)\)/);
    expect(src).toMatch(/card\.dataset\.rolar = '1'/);
    expect(corpo(pele, "[data-pele='v6'] [data-ms='cartao'][data-rolar]::before")).toMatch(/display:none/);
  });
});
