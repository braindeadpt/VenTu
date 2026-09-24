import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Guarda contra um bug SEO silencioso com duas caras:
 *
 * 1. As páginas de metadados passavam `locale: isPt ? 'pt' : 'en'` ao
 *    `buildPageMetadata` → `/es/ /de/ /fr/` declaravam **canonical para o URL
 *    EN**. Remédio: `validateLocale(locale)`.
 * 2. Páginas que montavam a metadata à mão **sem** `buildPageMetadata` (ou com
 *    `alternates.languages` só pt/en) herdavam o canonical da **home** — a
 *    landing auto-desindexava-se e as línguas não se cruzavam.
 *
 * O bug não aparece com dados de teste: só na metadata emitida no build. Por
 * isso o teste é ao nível do fonte (como o `mapaMetadata`).
 */
const PAGES_WITH_BUILDER = [
  'src/app/[locale]/mapa/page.tsx',
  'src/app/[locale]/explorar/page.tsx',
  'src/app/[locale]/explorar/[slug]/page.tsx',
  'src/app/[locale]/fontes/page.tsx',
  'src/app/[locale]/livecams/page.tsx',
  'src/app/[locale]/about/page.tsx',
  'src/app/[locale]/spots/page.tsx',
  'src/app/[locale]/spots/[slug]/page.tsx',
  'src/app/[locale]/diretorio/[slug]/page.tsx',
  'src/app/[locale]/ferramentas/page.tsx',
  'src/app/[locale]/ferramentas/calculadora-fato/page.tsx',
  'src/app/[locale]/ferramentas/calculadora-kite/page.tsx',
  'src/app/[locale]/sazonalidade/page.tsx',
  'src/app/[locale]/modalidades/page.tsx',
  'src/app/[locale]/modalidades/[slug]/page.tsx',
  'src/app/[locale]/news/page.tsx',
  'src/app/[locale]/compare/page.tsx',
  'src/app/[locale]/favorites/page.tsx',
];

/** Páginas que mantêm `alternates` à mão (têm OpenGraph que o builder não cobre). */
const PAGES_WITH_MANUAL_ALTERNATES = ['src/app/[locale]/news/[slug]/page.tsx'];

const LOCALES = ['pt', 'en', 'es', 'de', 'fr'];
const ALL_PAGES = [...PAGES_WITH_BUILDER, ...PAGES_WITH_MANUAL_ALTERNATES];

function read(page: string): string {
  return readFileSync(path.join(process.cwd(), page), 'utf-8');
}

/**
 * Bloco `languages: { … }` com contagem de chaves (os valores têm template
 * literals `${slug}`, por isso procurar o primeiro `}` cortava o bloco).
 */
function languagesBlock(source: string): string {
  const i = source.indexOf('languages:');
  if (i === -1) return '';
  const open = source.indexOf('{', i);
  if (open === -1) return '';
  let depth = 0;
  for (let j = open; j < source.length; j += 1) {
    const ch = source[j];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(i, j + 1).replace(/['"]/g, '');
    }
  }
  return '';
}

describe('metadata das páginas usa o locale real (canonical/hreflang)', () => {
  for (const page of PAGES_WITH_BUILDER) {
    it(`${page} resolve o locale com validateLocale + buildPageMetadata`, () => {
      const source = read(page);
      // Spot pages usam `buildSpotMetadata` (que delega no builder).
      expect(source).toMatch(/build(Page|Spot)Metadata/);
      expect(source).toContain('validateLocale(locale)');
      // O locale da metadata não pode voltar a ser forçado a pt/en
      // (`pipelineSchedule(isPt ? 'pt' : 'en')` é legítimo — só tem 2 variantes).
      expect(source).not.toMatch(/locale:\s*isPt/);
      expect(source).not.toMatch(/buildSpotMetadata\(isPt/);
    });
  }

  for (const page of PAGES_WITH_MANUAL_ALTERNATES) {
    it(`${page} anuncia as 5 línguas + x-default`, () => {
      const block = languagesBlock(read(page));
      expect(block, 'bloco languages em falta').not.toBe('');
      for (const loc of LOCALES) {
        expect(block, `falta hreflang ${loc}`).toContain(`${loc}:`);
      }
      expect(block, 'falta x-default').toContain('x-default');
    });
  }

  it('nenhuma página fica com alternates sem x-default', () => {
    const offenders = ALL_PAGES.filter((page) => {
      const block = languagesBlock(read(page));
      return block !== '' && !block.includes('x-default');
    });
    expect(offenders).toEqual([]);
  });
});
