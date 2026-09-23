import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Guarda contra um bug SEO silencioso: as páginas de metadados passavam
 * `locale: isPt ? 'pt' : 'en'` ao `buildPageMetadata`, o que fazia com que
 * `/es/ /de/ /fr/` declarassem **canonical para o URL EN** (conteúdo lido como
 * duplicado de EN). O correcto é `validateLocale(locale)` — o locale real da
 * rota, que o `buildPageMetadata` já valida e usa para canonical + hreflang.
 *
 * Este teste é deliberadamente ao nível do fonte (como o `mapaMetadata`): o bug
 * não aparece em runtime com dados de teste, só na metadata emitida no build.
 */
const PAGES = [
  'src/app/[locale]/mapa/page.tsx',
  'src/app/[locale]/explorar/page.tsx',
  'src/app/[locale]/fontes/page.tsx',
  'src/app/[locale]/livecams/page.tsx',
  'src/app/[locale]/about/page.tsx',
  'src/app/[locale]/spots/page.tsx',
  'src/app/[locale]/spots/[slug]/page.tsx',
  'src/app/[locale]/diretorio/[slug]/page.tsx',
];

describe('metadata das páginas usa o locale real (canonical/hreflang)', () => {
  for (const page of PAGES) {
    it(`${page} resolve o locale com validateLocale`, () => {
      const source = readFileSync(path.join(process.cwd(), page), 'utf-8');
      expect(source).toContain('validateLocale(locale)');
      // O que não pode voltar é o locale da metadata (e do spots) forçado a
      // pt/en — `pipelineSchedule(isPt ? 'pt' : 'en')` é legítimo (só tem 2
      // variantes de texto no pipeline).
      expect(source).not.toMatch(/locale:\s*isPt/);
      expect(source).not.toMatch(/buildSpotMetadata\(isPt/);
    });
  }

  it('nenhuma página de metadata força o locale pt/en', () => {
    for (const page of PAGES) {
      const source = readFileSync(path.join(process.cwd(), page), 'utf-8');
      expect(source).not.toMatch(/locale:\s*isPt/);
    }
  });
});
