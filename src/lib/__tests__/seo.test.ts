import { describe, it, expect } from 'vitest';
import {
  absoluteUrl,
  SITE_URL,
  SITE_NAME,
  buildPageMetadata,
  buildRootMetadata,
  buildHomeMetadata,
  buildWebApplicationJsonLd,
  buildOrganizationJsonLd,
  DEFAULT_OG_IMAGE_PATH,
} from '@/lib/seo';

describe('absoluteUrl', () => {
  it('prepends SITE_URL to a path starting with /', () => {
    expect(absoluteUrl('/pt/')).toBe(`${SITE_URL}/pt/`);
  });

  it('adds leading slash when path does not start with one', () => {
    expect(absoluteUrl('pt/')).toBe(`${SITE_URL}/pt/`);
  });
});

describe('buildPageMetadata', () => {
  it('builds metadata with canonical trailing slash', () => {
    const meta = buildPageMetadata({
      title: 'Test',
      description: 'Desc',
      locale: 'pt',
      path: '/pt/mapa',
    });
    expect(meta.alternates?.canonical).toBe('/pt/mapa/');
  });

  it('preserves existing trailing slash', () => {
    const meta = buildPageMetadata({
      title: 'Test',
      description: 'Desc',
      locale: 'pt',
      path: '/pt/mapa/',
    });
    expect(meta.alternates?.canonical).toBe('/pt/mapa/');
  });

  it('sets hreflang alternates for both locales', () => {
    const meta = buildPageMetadata({
      title: 'Test',
      description: 'Desc',
      locale: 'pt',
      path: '/pt/spots/',
    });
    const languages = meta.alternates?.languages as Record<string, string>;
    expect(languages.pt).toBe('/pt/spots/');
    expect(languages.en).toBe('/en/spots/');
  });

  it('sets OpenGraph locale correctly', () => {
    const meta = buildPageMetadata({
      title: 'Test',
      description: 'Desc',
      locale: 'en',
      path: '/en/',
    });
    const og = meta.openGraph as Record<string, unknown>;
    expect(og.locale).toBe('en_US');
    expect(og.alternateLocale).toEqual(['pt_PT']);
  });

  it('applies noIndex robots when requested', () => {
    const meta = buildPageMetadata({
      title: 'Test',
      description: 'Desc',
      locale: 'pt',
      path: '/pt/',
      noIndex: true,
    });
    const robots = meta.robots as Record<string, boolean>;
    expect(robots.index).toBe(false);
    expect(robots.follow).toBe(false);
  });

  it('uses default keywords when none provided', () => {
    const meta = buildPageMetadata({
      title: 'Test',
      description: 'Desc',
      locale: 'pt',
      path: '/pt/',
    });
    expect(Array.isArray(meta.keywords)).toBe(true);
    expect((meta.keywords as string[]).length).toBeGreaterThan(0);
  });

  it('uses custom keywords when provided', () => {
    const meta = buildPageMetadata({
      title: 'Test',
      description: 'Desc',
      locale: 'pt',
      path: '/pt/',
      keywords: ['custom'],
    });
    expect(meta.keywords).toEqual(['custom']);
  });

  it('sets twitter card to summary_large_image', () => {
    const meta = buildPageMetadata({
      title: 'Test',
      description: 'Desc',
      locale: 'pt',
      path: '/pt/',
    });
    const twitter = meta.twitter as Record<string, unknown>;
    expect(twitter.card).toBe('summary_large_image');
  });
});

describe('buildRootMetadata', () => {
  it('returns metadata with VenTu in title', () => {
    const meta = buildRootMetadata();
    expect(meta.title).toContain('VenTu');
  });
});

describe('buildHomeMetadata', () => {
  it('returns PT metadata for pt locale', () => {
    const meta = buildHomeMetadata('pt');
    expect(meta.title).toContain('Condições Náuticas');
  });

  it('returns EN metadata for en locale', () => {
    const meta = buildHomeMetadata('en');
    expect(meta.title).toContain('Water Sports');
  });
});

describe('buildWebApplicationJsonLd', () => {
  it('returns JSON-LD with WebApplication type', () => {
    const ld = buildWebApplicationJsonLd('pt');
    expect(ld['@type']).toBe('WebApplication');
    expect(ld.name).toBe(SITE_NAME);
    expect(ld.inLanguage).toBe('pt-PT');
  });

  it('uses EN language for en locale', () => {
    const ld = buildWebApplicationJsonLd('en');
    expect(ld.inLanguage).toBe('en');
  });

  it('includes free offer', () => {
    const ld = buildWebApplicationJsonLd('pt');
    expect(ld.offers.price).toBe('0');
  });
});

describe('buildOrganizationJsonLd', () => {
  it('returns JSON-LD with Organization type', () => {
    const ld = buildOrganizationJsonLd();
    expect(ld['@type']).toBe('Organization');
    expect(ld.name).toBe(SITE_NAME);
    expect(ld.url).toBe(SITE_URL);
  });

  it('includes logo', () => {
    const ld = buildOrganizationJsonLd();
    expect(ld.logo).toContain('og-image.png');
  });
});
