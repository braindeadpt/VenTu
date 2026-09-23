import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Contrato dos selectores estáveis dos toggles de camadas do mapa.
 *
 * Cada toggle de camada em /pt/mapa/ tem de ter um atributo data-map-*-toggle
 * nas DUAS superfícies que o renderizam:
 *   - MapControls (toolbar desktop, z-1200, centrada no topo);
 *   - a lista de camadas do sheet mobile — os items são construídos na
 *     MapLayersZone (sheetLayers, zona M5 desde o M1) e renderizados pelo
 *     MapExploreSheet (estado «half»), com o toggleAttr espalhado no
 *     <button>.
 *
 * HISTÓRIA (audit mobile 2026-09, de31e9111): radar e isóbatas nasceram sem
 * atributo — só tinham aria-label DEPENDENTE DO ESTADO («Radar IPMA» ↔
 * «Ocultar radar», useMapLayers.ts), tornando-os inlocalizáveis por selector
 * estável e sem cobertura e2e até alguém os inventar à mão. Este contrato
 * prende a lista: um toggle novo sem atributo em qualquer uma das superfícies
 * falha o build aqui (padrão mapStackingContract / hydrationGates).
 */
const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

const controls = read('src/components/spots/map/components/MapControls.tsx');
// Os items das camadas do sheet mobile constroem-se na zona de camadas
// (sheetLayers em MapLayersZone, dono M5 — ver docs/design/MAP-ZONES.md) —
// cada item leva toggleAttr + pressed + onToggle, que o MapExploreSheet
// aterra num <button aria-pressed onClick data-*> real.
const sheetItems = read('src/components/spots/map/zones/MapLayersZone.tsx');
const sheet = read('src/components/spots/map/components/MapExploreSheet.tsx');
const layersMenu = read('src/components/spots/map/components/MapLayersMenu.tsx');

/** A lista canónica — um toggle de camada novo entra AQUI e nas duas superfícies. */
const TOGGLES = [
  'data-map-radar-toggle',
  'data-map-hours-toggle',
  'data-map-hs-toggle',
  'data-map-sst-toggle',
  'data-map-currents-toggle',
  'data-map-buoys-toggle',
  'data-map-isobaths-toggle',
] as const;

describe('mapToggleAttributes (selectores estáveis dos toggles de camada)', () => {
  it('todas as camadas têm data-map-*-toggle na toolbar desktop (MapControls)', () => {
    for (const attr of TOGGLES) {
      expect(controls, `${attr} em falta na toolbar MapControls`).toContain(attr);
    }
  });

  it('todas as camadas têm data-map-*-toggle nos items do sheet mobile (sheetLayers)', () => {
    for (const attr of TOGGLES) {
      expect(sheetItems, `${attr} em falta nos sheetLayers`).toContain(attr);
    }
  });

  it('cada toggle declara o estado de pressão (aria-pressed direto ou via pressed:)', () => {
    // As superfícies expressam o estado por caminhos diferentes:
    //  - botões <button> crus: aria-pressed={...};
    //  - o wrapper MapControlButton: prop pressed={...} → aria-pressed no DOM;
    //  - os items de config (menu «Camadas» / sheetLayers): `pressed:` +
    //    `onToggle:` que o renderer aterra num <button aria-pressed onClick>.
    for (const [name, src] of [
      ['MapControls', controls],
      ['sheetLayers', sheetItems],
    ] as const) {
      for (const attr of TOGGLES) {
        const idx = src.indexOf(attr);
        expect(idx, `${attr} presente em ${name}`).toBeGreaterThan(-1);
        const block = src.slice(Math.max(0, idx - 600), idx + 100);
        const hasState =
          block.includes('aria-pressed') ||
          block.includes('pressed=') ||
          block.includes('pressed:');
        expect(hasState, `${attr} em ${name} sem estado de pressão por perto`).toBe(true);
      }
    }
  });

  it('cada toggle é um controlo interativo real (onClick/onToggle por perto)', () => {
    // Pino informal de interatividade: os toggles passam onClick — direto no
    // <button>, via prop do MapControlButton, ou como `onToggle:` num item de
    // config. Garante que os atributos continuam colados a controlos reais,
    // não a decoração órfã.
    for (const [name, src] of [
      ['MapControls', controls],
      ['sheetLayers', sheetItems],
    ] as const) {
      for (const attr of TOGGLES) {
        const idx = src.indexOf(attr);
        const block = src.slice(Math.max(0, idx - 600), idx + 100);
        expect(
          block.includes('onClick') || block.includes('onToggle'),
          `${attr} em ${name} sem onClick/onToggle por perto`,
        ).toBe(true);
      }
    }
  });

  it('o menu «Camadas» aterra cada item num <button> real com estado', () => {
    // A indirecção config→menu só vale se o MapLayersMenu continuar a
    // renderizar um controlo real: toggleAttr espalhado no botão, onToggle
    // como onClick e pressed como aria-pressed.
    expect(layersMenu).toContain('item.toggleAttr');
    expect(layersMenu).toContain('onClick={item.onToggle}');
    expect(layersMenu).toContain('aria-pressed={item.pressed}');
  });

  it('o sheet aterra cada item num <button> real com estado', () => {
    // Mesma indirecção no mobile: o LayerToggle do MapExploreSheet espalha
    // o toggleAttr, liga onToggle a onClick e pressed a aria-pressed.
    expect(sheet).toContain('item.toggleAttr');
    expect(sheet).toContain('onClick={item.onToggle}');
    expect(sheet).toContain('aria-pressed={item.pressed}');
  });
});
