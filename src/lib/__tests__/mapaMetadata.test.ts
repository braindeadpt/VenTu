import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { buildPageMetadata } from '@/lib/seo';
import { getTranslation } from '@/lib/i18n';

describe('mapa page SEO', () => {
  it('uses buildPageMetadata with trailing-slash paths', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/app/[locale]/mapa/page.tsx'),
      'utf-8',
    );
    expect(source).toContain('buildPageMetadata');
    expect(source).toContain('path: `/${loc}/mapa/`');
    // A copy vive no dicionário (5 línguas): o título deixou de ser literal.
    expect(source).toContain('pages.mapMetaTitle');
    expect(getTranslation('pt').pages.mapMetaTitle).toBe('Mapa de spots — VenTu');
    expect(getTranslation('en').pages.mapMetaTitle).toBe('Spots map — VenTu');
  });

  it('buildPageMetadata sets canonical and hreflang for mapa', () => {
    const pt = buildPageMetadata({
      title: 'Mapa de spots — VenTu',
      description: 'Mapa interactivo',
      locale: 'pt',
      path: '/pt/mapa/',
    });
    const en = buildPageMetadata({
      title: 'Spots map — VenTu',
      description: 'Interactive map',
      locale: 'en',
      path: '/en/mapa/',
    });

    expect(pt.alternates?.canonical).toBe('/pt/mapa/');
    expect(en.alternates?.canonical).toBe('/en/mapa/');
    expect(pt.alternates?.languages).toEqual({
      pt: '/pt/mapa/',
      en: '/en/mapa/',
      es: '/es/mapa/',
      de: '/de/mapa/',
      fr: '/fr/mapa/',
      'x-default': '/pt/mapa/',
    });
    expect(en.alternates?.languages).toEqual({
      pt: '/pt/mapa/',
      en: '/en/mapa/',
      es: '/es/mapa/',
      de: '/de/mapa/',
      fr: '/fr/mapa/',
      'x-default': '/pt/mapa/',
    });
    const images = pt.openGraph?.images;
    const first = Array.isArray(images) ? images[0] : images;
    const url = typeof first === 'object' && first && 'url' in first ? first.url : first;
    expect(url).toBe('/og-image.png');
  });
});
