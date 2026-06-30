import type { Metadata } from 'next';
import { existsSync } from 'fs';
import path from 'path';
import { spots } from '@/lib/spots';

export const SITE_URL = 'https://ventu.surf';
export const SITE_NAME = 'VenTu';
export const SPOT_COUNT = spots.length;

/** Default share image — PNG 1200×630 (WhatsApp / Facebook / X require raster). */
export const DEFAULT_OG_IMAGE_PATH = '/og-image.png';

export const DEFAULT_OG_IMAGE = {
  url: DEFAULT_OG_IMAGE_PATH,
  width: 1200,
  height: 630,
  type: 'image/png' as const,
  alt: 'VenTu — condições náuticas em Portugal',
};

export const DEFAULT_KEYWORDS_PT = [
  'surf portugal',
  'kitesurf portugal',
  'windsurf portugal',
  'condições ondas',
  'previsão surf',
  'guincho',
  'peniche',
  'nazaré',
  'costa vicentina',
  'desportos náuticos',
];

export const DEFAULT_KEYWORDS_EN = [
  'surf portugal',
  'kitesurf portugal',
  'windsurf portugal',
  'wave forecast',
  'surf conditions',
  'guincho',
  'peniche',
  'nazare',
  'water sports',
];

export function absoluteUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${normalized}`;
}

export type PageSeoInput = {
  title: string;
  description: string;
  locale: 'pt' | 'en';
  /** Path without domain, e.g. `/pt/mapa/` */
  path: string;
  /** Override OG/Twitter image path (relative). */
  imagePath?: string;
  imageAlt?: string;
  type?: 'website' | 'article';
  keywords?: string[];
  noIndex?: boolean;
};

export function buildPageMetadata(input: PageSeoInput): Metadata {
  const {
    title,
    description,
    locale,
    path,
    imagePath = DEFAULT_OG_IMAGE_PATH,
    imageAlt = DEFAULT_OG_IMAGE.alt,
    type = 'website',
    keywords,
    noIndex = false,
  } = input;

  const isPt = locale === 'pt';
  const canonicalPath = path.endsWith('/') ? path : `${path}/`;
  const ogLocale = isPt ? 'pt_PT' : 'en_US';
  const altLocale = isPt ? 'en_US' : 'pt_PT';
  const pathWithoutLocale = canonicalPath.replace(/^\/(pt|en)/, '');
  const altLocalePath = `/${isPt ? 'en' : 'pt'}${pathWithoutLocale}`;

  const image = {
    url: imagePath,
    width: DEFAULT_OG_IMAGE.width,
    height: DEFAULT_OG_IMAGE.height,
    type: (imagePath.endsWith('.jpg') || imagePath.endsWith('.jpeg')
      ? 'image/jpeg'
      : 'image/png') as 'image/jpeg' | 'image/png',
    alt: imageAlt,
  };

  return {
    title,
    description,
    keywords: keywords ?? (isPt ? DEFAULT_KEYWORDS_PT : DEFAULT_KEYWORDS_EN),
    alternates: {
      canonical: canonicalPath,
      languages: {
        pt: `/pt${pathWithoutLocale}`,
        en: `/en${pathWithoutLocale}`,
      },
    },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      siteName: SITE_NAME,
      locale: ogLocale,
      alternateLocale: [altLocale],
      type,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imagePath],
    },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true, 'max-image-preview': 'large' as const },
  };
}

/** Root `/` — crawlers (WhatsApp, Facebook) read this; humans pick locale below. */
export function buildRootMetadata(): Metadata {
  return buildPageMetadata({
    title: 'VenTu — Condições Náuticas em Portugal',
    description: `${SPOT_COUNT} spots · surf, kitesurf, windsurf e mais. Scores, mapa e previsão actualizados a cada 3 horas. Grátis e open source.`,
    locale: 'pt',
    path: '/pt/',
  });
}

/** Homepage metadata per locale. */
export function buildHomeMetadata(locale: 'pt' | 'en'): Metadata {
  const isPt = locale === 'pt';
  return buildPageMetadata({
    title: isPt
      ? `VenTu — ${SPOT_COUNT} spots · Condições Náuticas em Portugal`
      : `VenTu — ${SPOT_COUNT} spots · Water Sports in Portugal`,
    description: isPt
      ? `${SPOT_COUNT} spots em Portugal — scores por modalidade, mapa interactivo e previsão a cada 3 horas. Surf, kitesurf, windsurf, foil, SUP. Grátis.`
      : `${SPOT_COUNT} spots in Portugal — sport scores, interactive map and forecast every 3 hours. Surf, kitesurf, windsurf, foil, SUP. Free.`,
    locale,
    path: `/${locale}/`,
  });
}

export function buildSpotOgImagePath(slug: string): string {
  return `/images/og/${slug}.jpg`;
}

export function resolveSpotOgImagePath(slug: string): string {
  const branded = path.join(process.cwd(), 'public', 'images', 'og', `${slug}.jpg`);
  if (existsSync(branded)) return buildSpotOgImagePath(slug);
  return DEFAULT_OG_IMAGE_PATH;
}

export function buildSpotMetadata(
  locale: 'pt' | 'en',
  slug: string,
  spotName: string,
  regionName: string,
): Metadata {
  const isPt = locale === 'pt';
  const title = `${spotName} — Condições | VenTu`;
  const description = isPt
    ? `Condições em ${spotName}, ${regionName}. Ondas, vento e temperatura da água — actualizadas a cada 3 horas.`
    : `Conditions at ${spotName}, ${regionName}. Waves, wind and water temperature — updated every 3 hours.`;

  return buildPageMetadata({
    title,
    description,
    locale,
    path: `/${locale}/spots/${slug}/`,
    imagePath: resolveSpotOgImagePath(slug),
    imageAlt: isPt ? `Condições em ${spotName} — VenTu` : `${spotName} conditions — VenTu`,
    keywords: ['surf', spotName, regionName, 'Portugal', ...(isPt ? DEFAULT_KEYWORDS_PT : DEFAULT_KEYWORDS_EN)],
  });
}

export function buildWebApplicationJsonLd(locale: 'pt' | 'en') {
  const isPt = locale === 'pt';
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    applicationCategory: 'SportsApplication',
    operatingSystem: 'Web',
    url: absoluteUrl(`/${locale}/`),
    description: isPt
      ? `Condições para surf, kitesurf, windsurf e big wave em Portugal — ${SPOT_COUNT} spots, actualizadas a cada 3 horas`
      : `Water sports conditions in Portugal — ${SPOT_COUNT} spots, updated every 3 hours`,
    inLanguage: isPt ? 'pt-PT' : 'en',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    author: {
      '@type': 'Organization',
      name: 'VenTu',
      url: SITE_URL,
    },
  };
}

export function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl('/og-image.png'),
    sameAs: ['https://github.com/braindeadpt/ventu'],
  };
}
