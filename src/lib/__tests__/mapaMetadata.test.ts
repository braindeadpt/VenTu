import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { buildPageMetadata } from '@/lib/seo';
import { getTranslation } from '@/lib/i18n';

describe('mapa page SEO', () => {
  it('uses buildPageMetadata with trailing-slash paths and locale dictionary titles', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/app/[locale]/mapa/page.tsx'),
      'utf-8',
    );
    expect(source).toContain('buildPageMetadata');
    expect(source).toContain('path: `/${loc}/mapa/`');
    expect(source).toContain('getTranslation');
    expect(source).toContain('t.metaTitle');
    expect(getTranslation('pt').map.metaTitle).toBe('Mapa de spots — VenTu');
    expect(getTranslation('en').map.metaTitle).toBe('Spots map — VenTu');
    expect(getTranslation('es').map.metaTitle).toBe('Mapa de spots — VenTu');
    expect(getTranslation('de').map.metaTitle).toBe('Spots-Karte — VenTu');
    expect(getTranslation('fr').map.metaTitle).toBe('Carte des spots — VenTu');
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
