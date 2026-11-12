import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { mapUiChrome } from '@/lib/translations/mapUi/chrome';

/**
 * Fase B do /mapa, B5 — pilha de controlos, menu Camadas, base e legenda v6, mais o
 * chip de maré do cartão. Tudo atrás de [data-pele='v6']: os ganchos `data-mc` só
 * existem com a flag (com ela desligada o DOM do /mapa não muda).
 */
const raiz = process.cwd();
const css = readFileSync(join(raiz, 'src/styles/mapa-pele-v6.css'), 'utf-8');
const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
const regras = [...semComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ seletor: m[1].trim(), corpo: m[2] }));
const regra = (s: string) => regras.find((r) => r.seletor === s);
const ler = (f: string) => readFileSync(join(raiz, f), 'utf-8');

describe('B5 · CSS', () => {
  it('cada regra nova está dentro da pele, sem @media nem :root', () => {
    for (const s of [
      "[data-pele='v6'] [data-map-control-stack] .map-cb>button:not([aria-pressed='true'])",
      "[data-pele='v6'] [data-map-control-stack] [data-map-layers-menu][aria-expanded='true']",
      "[data-pele='v6'][data-map-layers-popover]",
      "[data-pele='v6'][data-map-layers-popover] button[aria-pressed='true'] [data-mc='sw']",
      "[data-pele='v6'][data-map-layers-popover] [data-mc='base']",
      "[data-pele='v6'] [data-mc='seg'] [role='radio'][aria-checked='true']",
      "[data-pele='v6'] [data-map-legend-card]",
      "[data-pele='v6'] [data-mc='dn']",
      "[data-pele='v6'] [data-ms='chip'][data-mare] svg",
    ]) expect(regra(s), s).toBeDefined();
    expect(semComentarios).not.toMatch(/:root|@media/);
    for (const r of regras) {
      for (const parte of r.seletor.split(',')) expect(parte.trim().startsWith("[data-pele='v6']"), parte).toBe(true);
    }
  });
  it('«ligado» em espuma, Camadas aberto com aro sol, interruptor sol', () => {
    expect(regra("[data-pele='v6'] [data-map-control-stack] button[aria-pressed='true']")!.corpo).toContain('background:var(--espuma)');
    expect(regra("[data-pele='v6'] [data-map-control-stack] [data-map-layers-menu][aria-expanded='true']")!.corpo).toContain('0 0 0 2px var(--sol)');
    expect(regra("[data-pele='v6'][data-map-layers-popover] button[aria-pressed='true'] [data-mc='sw']")!.corpo).toContain('background:var(--sol)');
  });
  it('as cinco bandas da legenda usam os tokens v6', () => {
    for (const [tier, b] of [['closed', 'nao'], ['poor', 'fraco'], ['fair', 'da'], ['good', 'bom'], ['epic', 'mb']]) {
      expect(regra(`[data-pele='v6'] [data-mc='bandas']>li[data-tier='${tier}']`)!.corpo).toContain(`background:var(--b-${b})`);
    }
  });
});

describe('B5 · componentes', () => {
  it('menu Camadas: data-pele e ganchos só com a flag; os itens e a ordem não mudam', () => {
    const f = ler('src/components/spots/map/components/MapLayersMenu.tsx');
    expect(f).toContain("data-pele={v6 ? 'v6' : undefined}");
    expect(f).toContain("const mc = (v: string) => (v6 ? v : undefined);");
    expect(f).toContain('{v6 ? (\n              <h2 data-mc="titulo" aria-hidden="true">');
    expect(f).toMatch(/const GROUP_ORDER: MapLayerGroup\[\] = \['time', 'sea', 'nav'\];/);
  });
  it('base da folha: segmentado só com a pele', () => {
    expect(ler('src/components/spots/map/components/MapBasemapRadio.tsx')).toContain("data-mc={v6 ? 'seg' : undefined}");
    expect(ler('src/components/spots/map/components/MapExploreSheet.tsx')).toContain('locale={locale} v6={v6} />');
  });
  it('legenda: a variante v6 só entra pelo chrome com a pele; noite ou escala antiga', () => {
    expect(ler('src/components/spots/map/zones/MapChromeZoneView.tsx')).toMatch(/v6: pele === 'v6'\n\s+\? \{ noite: mapNightAppliesTo\(sport\)/);
    const f = ler('src/components/spots/MapLegend.tsx');
    expect(f).toContain('{chrome.v6 ? (');
    expect(f).toContain('{noite ? (');
  });
  it('chip de maré do cartão v6 só no passo 0 (a maré é a de agora)', () => {
    const f = ler('src/components/spots/MapSpotPreview.tsx');
    expect(f).toContain('const tideChip = hoursFrame === 0 ? getMapTideLine(spot, conditions, locale) : null;');
    expect(f).toContain('<span data-ms="chip" data-mare="">');
  });
});

describe('B5 · textos da legenda', () => {
  it('as três chaves existem nas cinco línguas; a escala antiga tem {sport}', () => {
    for (const [loc, d] of Object.entries(mapUiChrome)) {
      expect(d.legendNotaV6, loc).toMatch(/0–10/);
      expect(d.legendNightV6.length, loc).toBeGreaterThan(5);
      expect(d.legendLegacyV6, loc).toContain('{sport}');
    }
    expect(mapUiChrome.pt.legendNightV6).toBe('Noite: sem nota até ao nascer do sol');
  });
});
