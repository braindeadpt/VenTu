import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Contrato dos selectores estáveis dos toggles de camadas do mapa.
 *
 * Cada toggle de camada em /pt/mapa/ tem de ter um atributo data-map-*-toggle
 * nas DUAS superfícies que o renderizam:
 *   - MapControls (coluna desktop, z-1200, left-[68px]);
 *   - MapExploreHud (strip mobile rolável + hero embeds).
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
const hud = read('src/components/spots/MapExploreHud.tsx');

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
  it('todas as camadas têm data-map-*-toggle na coluna desktop (MapControls)', () => {
    for (const attr of TOGGLES) {
      expect(controls, `${attr} em falta na coluna MapControls`).toContain(attr);
    }
  });

  it('todas as camadas têm data-map-*-toggle no strip mobile (MapExploreHud)', () => {
    for (const attr of TOGGLES) {
      expect(hud, `${attr} em falta no strip MapExploreHud`).toContain(attr);
    }
  });

  it('cada toggle declara o estado de pressão (aria-pressed direto ou via MapControlButton)', () => {
    // As duas superfícies expressam o estado por caminhos diferentes:
    //  - botões <button> crus: aria-pressed={...};
    //  - o wrapper MapControlButton: prop pressed={...} → aria-pressed no DOM
    //    (confirmado no componente). O que não pode faltar é O ESTADO.
    for (const [name, src] of [
      ['MapControls', controls],
      ['MapExploreHud', hud],
    ] as const) {
      for (const attr of TOGGLES) {
        const idx = src.indexOf(attr);
        expect(idx, `${attr} presente em ${name}`).toBeGreaterThan(-1);
        const block = src.slice(Math.max(0, idx - 600), idx + 100);
        const hasState = block.includes('aria-pressed') || block.includes('pressed=');
        expect(hasState, `${attr} em ${name} sem estado de pressão por perto`).toBe(true);
      }
    }
  });

  it('cada toggle é um controlo interativo real (onClick por perto)', () => {
    // Pino informal de interatividade: os toggles passam onClick — direto no
    // <button> ou via prop do MapControlButton. Garante que os atributos
    // continuam colados a controlos reais, não a decoração órfã.
    for (const [name, src] of [
      ['MapControls', controls],
      ['MapExploreHud', hud],
    ] as const) {
      for (const attr of TOGGLES) {
        const idx = src.indexOf(attr);
        const block = src.slice(Math.max(0, idx - 600), idx + 100);
        expect(block, `${attr} em ${name} sem onClick por perto`).toContain('onClick');
      }
    }
  });
});