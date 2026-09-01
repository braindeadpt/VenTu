import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  IPMA_URL,
  IPMA_RADAR_ATTRIBUTION_LABEL_PT,
  IPMA_RADAR_ATTRIBUTION_LABEL_EN,
} from '@/lib/ipmaAttribution';

/**
 * A atribuição obrigatória do IPMA (dados de radar) tem UMA fonte única
 * (ipmaAttribution) reutilizada no badge do radar e na tabela de /fontes.
 * Garante a consistência das URLs/rótulos entre o badge do radar e a lista
 * de fontes — e que os consumidores importam do módulo em vez de duplicar.
 */

const CONSUMERS = [
  {
    file: 'src/components/spots/RadarCarousel.tsx',
    mustImport: "from '@/lib/ipmaAttribution'",
  },
  {
    file: 'src/components/spots/SpotMapInteractive.tsx',
    mustImport: "from '@/lib/ipmaAttribution'",
  },
  {
    file: 'src/lib/dataSources.tsx',
    mustImport: "from '@/lib/ipmaAttribution'",
  },
];

describe('IPMA radar attribution (fonte única)', () => {
  it('URL e rótulos canónicos têm os valores exactos', () => {
    expect(IPMA_URL).toBe('https://www.ipma.pt/');
    expect(IPMA_RADAR_ATTRIBUTION_LABEL_PT).toBe('Dados IPMA');
    expect(IPMA_RADAR_ATTRIBUTION_LABEL_EN).toBe('IPMA data');
  });

  it('consumidores importam do módulo partilhado (não duplicam a URL)', () => {
    for (const c of CONSUMERS) {
      const src = readFileSync(c.file, 'utf-8');
      expect(src, `${c.file} deve importar de ipmaAttribution`).toContain(
        c.mustImport,
      );
      // A URL do IPMA não deve estar hardcoded nos consumidores — vive no módulo.
      expect(
        src,
        `${c.file} não deve duplicar a URL do IPMA`,
      ).not.toContain('https://www.ipma.pt/');
    }
  });
});