import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { V6_BASE_FILTER_ID, V6_BASE_TABLE_SIZE, v6BaseApply, v6BaseTable } from '@/lib/mapPeleBase';
import { MAP_PELE_BASE_LS_KEY, MAP_PELE_BASE_PARAM, resolveMapPeleBase } from '@/lib/mapPele';

/**
 * Fase B do /mapa, B6 (D1): recolor da base «Mapa» com um filtro SVG, atrás de
 * `?pele=v6&pelebase=v6`. Nunca no Satélite; sem a flag o /mapa não muda.
 */
const raiz = process.cwd();
const ler = (f: string) => readFileSync(join(raiz, f), 'utf-8');
const hex = (c: number[]) => '#' + c.map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('');

describe('B6 · tabela do filtro', () => {
  it('52 pontos por canal, iguais aos da maquete (filtro.py)', () => {
    for (const ch of [0, 1, 2] as const) expect(v6BaseTable(ch).split(' ')).toHaveLength(V6_BASE_TABLE_SIZE);
    const r = v6BaseTable(0).split(' ');
    expect(r.slice(0, 3)).toEqual(['0.0118', '0.0181', '0.0245']);
    expect(r[r.length - 1]).toBe('0.6627');
    expect(v6BaseTable(1).split(' ')[7]).toBe('0.2222');
    expect(v6BaseTable(2).split(' ').at(-1)).toBe('0.8314');
  });
  it('o mar do Dark Gray (cinzento 35) fica azul v6 e a terra (71) ardósia, mais escura que o mar', () => {
    const mar = v6BaseApply(35);
    const terra = v6BaseApply(71);
    // perto de #0E3A5E (mar) e de #111C28 → ardósia (terra)
    expect(Math.abs(mar[2] - 94)).toBeLessThanOrEqual(8);
    expect(mar[2]).toBeGreaterThan(mar[0] + 50);
    expect(terra[1] + terra[2]).toBeLessThan(mar[1] + mar[2]);
    expect(hex(v6BaseApply(255))).toBe('#A9C2D4'); // linhas a névoa
    expect(hex(v6BaseApply(0))).toBe('#030E18'); // abismo
  });
});

describe('B6 · flag própria', () => {
  it('nome do parâmetro e da chave', () => {
    expect(MAP_PELE_BASE_PARAM).toBe('pelebase');
    expect(MAP_PELE_BASE_LS_KEY).toBe('ventu:map:pele-base');
  });
  it('só vale com a pele; o URL vence o gravado', () => {
    expect(resolveMapPeleBase('v6', 'v6', null)).toEqual({ activa: true, gravar: 'v6' });
    expect(resolveMapPeleBase(null, 'v6', null)).toEqual({ activa: false, gravar: 'v6' });
    expect(resolveMapPeleBase('v6', null, 'v6')).toEqual({ activa: true, gravar: null });
    expect(resolveMapPeleBase('v6', '0', 'v6')).toEqual({ activa: false, gravar: 'apagar' });
    expect(resolveMapPeleBase('v6', null, null)).toEqual({ activa: false, gravar: null });
  });
});

describe('B6 · CSS e ligação', () => {
  const css = ler('src/styles/mapa-pele-v6.css').replace(/\/\*[\s\S]*?\*\//g, '');
  it('o filtro só entra com as duas flags, no modo mapa escuro e na camada recolorida', () => {
    const r = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[2].includes('url(#v6base)'));
    expect(r).toHaveLength(1);
    expect(r[0][1].trim()).toBe(
      "[data-pele='v6'][data-pele-base='v6'] .leaflet-container[data-basemap='map'][data-map-theme='dark'] .ventu-base-v6",
    );
    expect(css).not.toMatch(/satellite[^{]*\{[^}]*filter:url/);
    expect(V6_BASE_FILTER_ID).toBe('v6base');
  });
  it('useMapCore: Esri Dark Gray com a classe só no modo mapa escuro com o recolor; o resto igual', () => {
    const f = ler('src/components/spots/map/hooks/useMapCore.ts');
    expect(f).toContain("export const MAP_BASE_V6_CLASS = 'ventu-base-v6';");
    expect(f).toMatch(/if \(recolor && dark\) \{\n[\s\S]*?getEsriRasterBasemap\(true\)[\s\S]*?className: MAP_BASE_V6_CLASS/);
    // o ramo do satélite vem antes e não leva a classe
    expect(f.indexOf("if (mode === 'satellite') {\n    const layer")).toBeLessThan(f.indexOf('if (recolor && dark) {'));
    expect(f).toContain("return `map:${dark ? 'dark' : 'light'}${recolor && dark ? ':v6' : ''}`;");
  });
  it('contentor: data-pele-base e o <svg> só com a flag; o mapa recebe recolorV6 só com a pele', () => {
    const c = ler('src/components/spots/MapaFullscreenClient.tsx');
    expect(c).toContain("data-pele-base={peleBase ? 'v6' : undefined}");
    expect(c).toContain('{peleBase ? <MapPeleBaseFilter /> : null}');
    expect(ler('src/components/spots/SpotMapInteractive.tsx')).toContain("recolorV6: mapHud?.pele === 'v6' && mapHud.peleBase === true,");
  });
});
