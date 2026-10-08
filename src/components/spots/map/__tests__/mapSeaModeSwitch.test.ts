import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MapSeaModeSwitch, { MAP_SEA_MODES } from '../components/MapSeaModeSwitch';
import { mapUiLayers } from '@/lib/translations/mapUi/layers';

/**
 * Selector «Vento | Ondulação | Nenhum» do /mapa — contrato de acessibilidade
 * (WAI-ARIA radio group) e traduções nas 5 línguas.
 */
const labels = { group: 'Camada sobre o mar', wind: 'Vento', swell: 'Ondulação', none: 'Nenhum' };

function render(value: 'wind' | 'swell' | 'none') {
  return renderToStaticMarkup(createElement(MapSeaModeSwitch, { value, onChange: () => {}, labels }));
}

describe('MapSeaModeSwitch', () => {
  it('é um radiogroup com nome e três radios na ordem da maquete', () => {
    const html = render('wind');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Camada sobre o mar"');
    expect((html.match(/role="radio"/g) ?? []).length).toBe(3);
    const order = MAP_SEA_MODES.map((m) => html.indexOf(`data-map-sea-mode-option="${m}"`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html.indexOf('Vento')).toBeLessThan(html.indexOf('Ondulação'));
    expect(html.indexOf('Ondulação')).toBeLessThan(html.indexOf('Nenhum'));
  });

  it('só o seleccionado está marcado e entra no Tab (tabindex itinerante)', () => {
    for (const mode of MAP_SEA_MODES) {
      const html = render(mode);
      expect(html).toContain(`data-map-sea-mode="${mode}"`);
      expect((html.match(/aria-checked="true"/g) ?? []).length).toBe(1);
      expect((html.match(/tabindex="0"/g) ?? []).length).toBe(1);
      expect((html.match(/tabindex="-1"/g) ?? []).length).toBe(2);
      const sel = html.indexOf(`data-map-sea-mode-option="${mode}"`);
      const btn = html.slice(html.lastIndexOf('<button', sel), html.indexOf('>', sel));
      expect(btn).toContain('aria-checked="true"');
      expect(btn).toContain('tabindex="0"');
    }
  });

  it('tem rótulos nas 5 línguas', () => {
    for (const loc of ['pt', 'en', 'es', 'de', 'fr'] as const) {
      const l = mapUiLayers[loc];
      for (const k of ['seaModeGroup', 'seaModeWind', 'seaModeNone', 'layerSwell'] as const) {
        expect(typeof l[k], `${loc}.${k}`).toBe('string');
        expect(l[k].length, `${loc}.${k}`).toBeGreaterThan(1);
      }
    }
    expect(mapUiLayers.pt.seaModeWind).toBe('Vento');
    expect(mapUiLayers.pt.layerSwell).toBe('Ondulação');
    expect(mapUiLayers.pt.seaModeNone).toBe('Nenhum');
  });
});
