import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  OpenMeteoAttribution,
  OPEN_METEO_URL,
  OPEN_METEO_LICENSE_URL,
  OPEN_METEO_ATTRIBUTION_LABEL,
  OPEN_METEO_ATTRIBUTION_HTML,
} from '@/lib/openMeteoAttribution';

/**
 * A cadeia de atribuição obrigatória do Open-Meteo (CC BY 4.0) tem UMA fonte
 * única (openMeteoAttribution) reutilizada no About, no mapa e no badge do
 * radar. Estes testes garantem que:
 *  1. as constantes/elementos canónicos têm os valores exactos exigidos pela
 *     licença (o copyright tem de ser literal e ligado às URLs correctas);
 *  2. o componente e a variante HTML (Leaflet) são equivalentes;
 *  3. os consumidores (map-constants, RadarCarousel, dataSources, About)
 *     importam do módulo partilhado em vez de duplicar as URLs/texto.
 */

const CONSUMERS = [
  {
    file: 'src/lib/map-constants.ts',
    mustImport: "from './openMeteoAttribution'",
  },
  {
    file: 'src/components/spots/RadarCarousel.tsx',
    mustImport: "from '@/lib/openMeteoAttribution'",
  },
  {
    file: 'src/lib/dataSources.tsx',
    mustImport: "from '@/lib/openMeteoAttribution'",
  },
  {
    file: 'src/app/[locale]/about/page.tsx',
    mustImport: "from '@/lib/openMeteoAttribution'",
  },
];

describe('Open-Meteo attribution (fonte única)', () => {
  it('URLs e label canónicos têm os valores exactos da licença', () => {
    expect(OPEN_METEO_URL).toBe('https://open-meteo.com/');
    expect(OPEN_METEO_LICENSE_URL).toBe(
      'https://creativecommons.org/licenses/by/4.0/',
    );
    expect(OPEN_METEO_ATTRIBUTION_LABEL).toBe(
      'Weather data by Open-Meteo.com (CC BY 4.0)',
    );
  });

  it('componente React renderiza os dois links com as URLs canónicas', () => {
    const markup = renderToStaticMarkup(
      createElement(OpenMeteoAttribution, { className: 'underline' }),
    );
    expect(markup).toContain('Weather data by');
    expect(markup).toContain(`href="${OPEN_METEO_URL}"`);
    expect(markup).toContain(`href="${OPEN_METEO_LICENSE_URL}"`);
    expect(markup).toContain('Open-Meteo.com');
    expect(markup).toContain('CC BY 4.0');
    // Duas âncoras separadas (Open-Meteo.com + licença), como About/fontes.
    expect((markup.match(/<a /g) ?? []).length).toBe(2);
  });

  it('variante HTML (mapa Leaflet) é consistente com o componente e o label', () => {
    expect(OPEN_METEO_ATTRIBUTION_HTML).toContain('Weather data by');
    expect(OPEN_METEO_ATTRIBUTION_HTML).toContain('Open-Meteo.com');
    expect(OPEN_METEO_ATTRIBUTION_HTML).toContain('CC BY 4.0');
    expect(OPEN_METEO_ATTRIBUTION_HTML).toContain(`href="${OPEN_METEO_URL}"`);
    expect(OPEN_METEO_ATTRIBUTION_HTML).toContain(
      `href="${OPEN_METEO_LICENSE_URL}"`,
    );
  });

  it('consumidores importam do módulo partilhado (não duplicam URLs/texto)', () => {
    for (const c of CONSUMERS) {
      const src = readFileSync(c.file, 'utf-8');
      expect(src, `${c.file} deve importar de openMeteoAttribution`).toContain(
        c.mustImport,
      );
      // Nenhum consumidor deve ter a licença hardcoded (essa vive no módulo).
      expect(
        src,
        `${c.file} não deve duplicar a cadeia literal`,
      ).not.toContain('Weather data by Open-Meteo.com');
    }
  });
});