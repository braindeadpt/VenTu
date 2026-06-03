import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { buildPageMetadata } from '@/lib/seo';

describe('mapa page SEO', () => {
  it('uses buildPageMetadata with trailing-slash paths', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/app/[locale]/mapa/page.tsx'),
      'utf-8',
    );
    expect(source).toContain('buildPageMetadata');
    expect(source).toContain('path: `/${loc}/mapa/`');
    expect(source).toContain('Mapa de spots — VenTu');
    expect(source).toContain('Spots map — VenTu');
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
    expect(pt.alternates?.languages).toEqual({ pt: '/pt/mapa/', en: '/en/mapa/' });
    expect(en.alternates?.languages).toEqual({ pt: '/pt/mapa/', en: '/en/mapa/' });
    expect(pt.openGraph?.images?.[0]?.url).toBe('/og-image.png');
  });
});
