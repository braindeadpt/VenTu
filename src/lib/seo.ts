import type { Metadata } from 'next';
import { existsSync } from 'fs';
import path from 'path';
import { spots } from '@/lib/spots';
import { getSpotTypeLabel } from '@/lib/mapDifficulty';
import type { Spot } from '@/types';
import { pipelineSchedule } from '@/lib/dataPipelineSchedule';
import {
  getTranslation,
  locales,
  localePathPattern,
  LOCALE_OG,
  pickLocale,
  type Locale,
  validateLocale,
  defaultLocale,
} from '@/lib/i18n';
import { SITE_NAME, SITE_URL } from '@/lib/site';

export { SITE_NAME, SITE_URL };

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

export const DEFAULT_KEYWORDS_ES = [
  'surf portugal',
  'kitesurf portugal',
  'windsurf portugal',
  'previsión olas',
  'condiciones surf',
  'guincho',
  'peniche',
  'nazaré',
  'deportes náuticos',
];

export const DEFAULT_KEYWORDS_DE = [
  'surf portugal',
  'kitesurf portugal',
  'windsurf portugal',
  'wellenprognose',
  'surfbedingungen',
  'guincho',
  'peniche',
  'nazare',
  'wassersport',
];

export const DEFAULT_KEYWORDS_FR = [
  'surf portugal',
  'kitesurf portugal',
  'windsurf portugal',
  'prévision vagues',
  'conditions surf',
  'guincho',
  'peniche',
  'nazaré',
  'sports nautiques',
];

export function absoluteUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${normalized}`;
}

export type PageSeoInput = {
  title: string;
  description: string;
  locale: Locale;
  /** Path without domain, e.g. `/pt/mapa/` */
  path: string;
  /** Override OG/Twitter image path (relative). */
  imagePath?: string;
  imageAlt?: string;
  type?: 'website' | 'article';
  keywords?: string[];
  noIndex?: boolean;
};

function defaultKeywords(locale: Locale): string[] {
  return pickLocale(locale, {
    pt: DEFAULT_KEYWORDS_PT,
    en: DEFAULT_KEYWORDS_EN,
    es: DEFAULT_KEYWORDS_ES,
    de: DEFAULT_KEYWORDS_DE,
    fr: DEFAULT_KEYWORDS_FR,
  });
}

/**
 * Strip a brand suffix/prefix already embedded in the title ("— VenTu",
 * "| VenTu", "VenTu — "): the root layout's title.template appends
 * `| VenTu` to every page title, so embedded branding renders doubled.
 */
function normalizeTitle(title: string): string {
  return title
    .replace(/^\s*VenTu\s+[—–|-]\s+/i, '')
    .replace(/\s+[—–|-]\s*VenTu\s*$/i, '')
    .trim();
}

export function buildPageMetadata(input: PageSeoInput): Metadata {
  const {
    title: rawTitle,
    description,
    locale: rawLocale,
    path,
    imagePath = DEFAULT_OG_IMAGE_PATH,
    imageAlt = DEFAULT_OG_IMAGE.alt,
    type = 'website',
    keywords,
    noIndex = false,
  } = input;

  const locale = validateLocale(rawLocale);
  const canonicalPath = path.endsWith('/') ? path : `${path}/`;
  const ogLocale = LOCALE_OG[locale];
  const pathWithoutLocale = canonicalPath.replace(localePathPattern, '') || '/';
  const normalizedPath = pathWithoutLocale.startsWith('/')
    ? pathWithoutLocale
    : `/${pathWithoutLocale}`;

  const languages: Record<string, string> = {};
  for (const loc of locales) {
    languages[loc] = `/${loc}${normalizedPath === '/' ? '/' : normalizedPath}`;
  }
  // x-default: variante a servir a quem não corresponde a nenhuma língua.
  // PT é o `defaultLocale` do site (o root redirecciona para /pt/).
  languages['x-default'] = `/${defaultLocale}${normalizedPath === '/' ? '/' : normalizedPath}`;

  const alternateLocales = locales.filter((l) => l !== locale).map((l) => LOCALE_OG[l]);

  const image = {
    url: imagePath,
    width: DEFAULT_OG_IMAGE.width,
    height: DEFAULT_OG_IMAGE.height,
    type: (imagePath.endsWith('.jpg') || imagePath.endsWith('.jpeg')
      ? 'image/jpeg'
      : 'image/png') as 'image/jpeg' | 'image/png',
    alt: imageAlt,
  };

  const title = normalizeTitle(rawTitle);

  return {
    title,
    description,
    keywords: keywords ?? defaultKeywords(locale),
    alternates: {
      canonical: canonicalPath,
      languages,
      types: {
        'application/rss+xml': [
          { url: '/rss.xml', title: 'VenTu — Notícias náuticas (PT)' },
          { url: '/rss-en.xml', title: 'VenTu News (EN)' },
        ],
      },
    },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      siteName: SITE_NAME,
      locale: ogLocale,
      alternateLocale: alternateLocales,
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
    description: `${SPOT_COUNT} spots · surf, kitesurf, windsurf e mais. Scores, mapa e previsão ${pipelineSchedule('pt')}. Grátis e open source.`,
    locale: 'pt',
    path: '/pt/',
  });
}

/** Homepage metadata per locale. */
export function buildHomeMetadata(locale: Locale): Metadata {
  const loc = validateLocale(locale);
  return buildPageMetadata({
    title: pickLocale(loc, {
      pt: `VenTu — ${SPOT_COUNT} spots · Condições Náuticas em Portugal`,
      en: `VenTu — ${SPOT_COUNT} spots · Water Sports in Portugal`,
      es: `VenTu — ${SPOT_COUNT} spots · Deportes náuticos en Portugal`,
      de: `VenTu — ${SPOT_COUNT} Spots · Wassersport in Portugal`,
      fr: `VenTu — ${SPOT_COUNT} spots · Sports nautiques au Portugal`,
    }),
    description: pickLocale(loc, {
      pt: `${SPOT_COUNT} spots em Portugal — scores por modalidade, mapa interactivo e previsão ${pipelineSchedule('pt')}. Surf, kitesurf, windsurf, foil, SUP. Grátis.`,
      en: `${SPOT_COUNT} spots in Portugal — sport scores, interactive map and forecast ${pipelineSchedule('en')}. Surf, kitesurf, windsurf, foil, SUP. Free.`,
      es: `${SPOT_COUNT} spots en Portugal — scores por modalidad, mapa interactivo y previsión ${pipelineSchedule('es')}. Surf, kitesurf, windsurf, foil, SUP. Gratis.`,
      de: `${SPOT_COUNT} Spots in Portugal — Sport-Scores, interaktive Karte und Vorhersage ${pipelineSchedule('de')}. Surf, Kitesurf, Windsurf, Foil, SUP. Kostenlos.`,
      fr: `${SPOT_COUNT} spots au Portugal — scores par sport, carte interactive et prévision ${pipelineSchedule('fr')}. Surf, kitesurf, windsurf, foil, SUP. Gratuit.`,
    }),
    locale: loc,
    path: `/${loc}/`,
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
  locale: Locale,
  slug: string,
  spotName: string,
  regionName: string,
): Metadata {
  const loc = validateLocale(locale);
  const title = pickLocale(loc, {
    pt: `${spotName} — Condições | VenTu`,
    en: `${spotName} — Conditions | VenTu`,
    es: `${spotName} — Condiciones | VenTu`,
    de: `${spotName} — Bedingungen | VenTu`,
    fr: `${spotName} — Conditions | VenTu`,
  });
  const description = pickLocale(loc, {
    pt: `Condições em ${spotName}, ${regionName}. Ondas, vento e temperatura da água — ${pipelineSchedule('pt')}.`,
    en: `Conditions at ${spotName}, ${regionName}. Waves, wind and water temperature — ${pipelineSchedule('en')}.`,
    es: `Condiciones en ${spotName}, ${regionName}. Olas, viento y temperatura del agua — ${pipelineSchedule('es')}.`,
    de: `Bedingungen in ${spotName}, ${regionName}. Wellen, Wind und Wassertemperatur — ${pipelineSchedule('de')}.`,
    fr: `Conditions à ${spotName}, ${regionName}. Vagues, vent et température de l'eau — ${pipelineSchedule('fr')}.`,
  });

  return buildPageMetadata({
    title,
    description,
    locale: loc,
    path: `/${loc}/spots/${slug}/`,
    imagePath: resolveSpotOgImagePath(slug),
    imageAlt: pickLocale(loc, {
      pt: `Condições em ${spotName} — VenTu`,
      en: `${spotName} conditions — VenTu`,
      es: `Condiciones en ${spotName} — VenTu`,
      de: `Bedingungen in ${spotName} — VenTu`,
      fr: `Conditions à ${spotName} — VenTu`,
    }),
    keywords: ['surf', spotName, regionName, 'Portugal', ...defaultKeywords(loc)],
  });
}

export function buildWebApplicationJsonLd(locale: Locale) {
  const loc = validateLocale(locale);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    applicationCategory: 'SportsApplication',
    operatingSystem: 'Web',
    url: absoluteUrl(`/${loc}/`),
    description: pickLocale(loc, {
      pt: `Condições para surf, kitesurf, windsurf e big wave em Portugal — ${SPOT_COUNT} spots, ${pipelineSchedule('pt')}`,
      en: `Water sports conditions in Portugal — ${SPOT_COUNT} spots, ${pipelineSchedule('en')}`,
      es: `Condiciones de surf, kitesurf, windsurf y big wave en Portugal — ${SPOT_COUNT} spots, ${pipelineSchedule('es')}`,
      de: `Bedingungen für Surf, Kitesurf, Windsurf und Big Wave in Portugal — ${SPOT_COUNT} Spots, ${pipelineSchedule('de')}`,
      fr: `Conditions de surf, kitesurf, windsurf et big wave au Portugal — ${SPOT_COUNT} spots, ${pipelineSchedule('fr')}`,
    }),
    inLanguage: pickLocale(loc, { pt: 'pt-PT', en: 'en', es: 'es', de: 'de', fr: 'fr' }),
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

/**
 * Per-spot structured data: the place itself (SportsActivityLocation with
 * geo + sport type) and the breadcrumb Home → Spots → spot.
 */
export function buildSpotJsonLd(input: {
  locale: Locale;
  slug: string;
  spotName: string;
  regionName: string;
  description?: string;
  lat?: number;
  lon?: number;
  spotType?: Spot['type'];
}) {
  const loc = validateLocale(input.locale);
  const spotUrl = absoluteUrl(`/${loc}/spots/${input.slug}/`);

  const place: Record<string, unknown> = {
    '@type': 'SportsActivityLocation',
    name: input.spotName,
    url: spotUrl,
    ...(input.description ? { description: input.description } : {}),
    ...(input.lat != null && input.lon != null
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: input.lat,
            longitude: input.lon,
          },
        }
      : {}),
    address: {
      '@type': 'PostalAddress',
      addressRegion: input.regionName,
      addressCountry: 'PT',
    },
    containedInPlace: { '@type': 'AdministrativeArea', name: input.regionName },
    // `activityType` não existe no vocabulário Schema.org — o desporto vai
    // como propriedade extra. Sem isAccessibleForFree: o catálogo não
    // confirma condições de acesso (ex.: cable park é pago).
    ...(input.spotType
      ? {
          additionalProperty: [
            {
              '@type': 'PropertyValue',
              name: pickLocale(loc, {
                pt: 'modalidade',
                en: 'sport',
                es: 'deporte',
                de: 'Sportart',
                fr: 'sport',
              }),
              // Rótulo traduzido do catálogo (ex.: 'multisport' → 'Multisport').
              value: getSpotTypeLabel(input.spotType, loc),
            },
          ],
        }
      : {}),
  };

  const nav = getTranslation(loc).nav;

  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: nav.home,
        item: absoluteUrl(`/${loc}/`),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: nav.spots,
        item: absoluteUrl(`/${loc}/spots/`),
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: input.spotName,
        item: spotUrl,
      },
    ],
  };

  return { '@context': 'https://schema.org', '@graph': [place, breadcrumb] };
}
