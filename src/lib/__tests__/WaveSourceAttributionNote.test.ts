import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WaveSourceAttributionNote from '@/components/ui/WaveSourceAttributionNote';

const render = (props: { source: 'ih-buoy' | 'wmo-buoy'; locale: 'pt' | 'en' }) =>
  renderToStaticMarkup(createElement(WaveSourceAttributionNote, props));

/**
 * A nota de atribuição das superfícies compactas (TopNow, mapa, comparador)
 * tem de reutilizar a MESMA cadeia da tabela de /fontes (ATTRIBUTIONS) — uma
 * leitura WMO mostra a nota Copernicus, uma IH mostra a do IH, nunca a troca.
 */
describe('WaveSourceAttributionNote — reutiliza ATTRIBUTIONS nas superfícies compactas', () => {
  it('leitura WMO → nota Copernicus (cadeia da tabela /fontes)', () => {
    const html = render({ source: 'wmo-buoy', locale: 'pt' });
    expect(html).toContain('data-wave-attribution="copernicus"');
    expect(html).toContain('Generated using E.U.');
    expect(html).toContain('marine.copernicus.eu');
    expect(html).not.toContain('Instituto Hidrográfico');
  });

  it('leitura IH → nota IH (e NUNCA a Copernicus)', () => {
    const html = render({ source: 'ih-buoy', locale: 'en' });
    expect(html).toContain('data-wave-attribution="ih-buoys"');
    expect(html).toContain('Instituto Hidrográfico');
    expect(html).toContain('CC BY-NC 4.0');
    expect(html).not.toContain('Copernicus');
  });
});