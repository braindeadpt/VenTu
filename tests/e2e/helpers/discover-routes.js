/**
 * Discover all static export routes for E2E audit (mirrors sitemap / generateStaticParams).
 */
const fs = require('fs');
const path = require('path');
const { getSeoLandingSlugs } = require('../../../scripts/seo-landings-slugs');

const LOCALES = ['pt', 'en'];
const MODALITY_SLUGS = [
  'surf', 'kitesurf', 'windsurf', 'big-wave', 'bodyboard', 'sup', 'foil', 'wakeboard',
];

const STATIC_PATHS = [
  '/',
  '/about/',
  '/explorar/',
  '/mapa/',
  '/spots/',
  '/favorites/',
  '/compare/',
  '/news/',
  '/sazonalidade/',
  '/livecams/',
  '/admin/contributions/',
  '/alerts/',
  '/alerts/confirm/',
  '/alerts/unsubscribe/',
];

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function newsSlug(item) {
  const base = slugify(item.title);
  const hash = item.id.slice(-6);
  return `${base}-${hash}`;
}

function getSpotSlugs() {
  const spotsPath = path.join(__dirname, '../../../src/lib/spots.ts');
  const content = fs.readFileSync(spotsPath, 'utf-8');
  return [...content.matchAll(/slug:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

function getNewsSlugs() {
  const newsPath = path.join(__dirname, '../../../public/data/news.json');
  if (!fs.existsSync(newsPath)) return [];
  try {
    const items = JSON.parse(fs.readFileSync(newsPath, 'utf-8'));
    return items.map(newsSlug);
  } catch {
    return [];
  }
}

function localePath(locale, subpath) {
  const normalized = subpath.startsWith('/') ? subpath : `/${subpath}`;
  return `/${locale}${normalized}`;
}

/** @returns {{ path: string, group: string }[]} */
function discoverAllRoutes() {
  const routes = [];

  for (const locale of LOCALES) {
    for (const sub of STATIC_PATHS) {
      routes.push({ path: localePath(locale, sub), group: 'static' });
    }

    for (const slug of MODALITY_SLUGS) {
      routes.push({ path: localePath(locale, `/modalidades/${slug}/`), group: 'modalidade' });
    }

    for (const slug of getSeoLandingSlugs()) {
      routes.push({ path: localePath(locale, `/explorar/${slug}/`), group: 'explorar' });
    }

    for (const slug of getSpotSlugs()) {
      routes.push({ path: localePath(locale, `/spots/${slug}/`), group: 'spot' });
    }

    for (const slug of getNewsSlugs()) {
      routes.push({ path: localePath(locale, `/news/${slug}/`), group: 'news' });
    }
  }

  return routes;
}

module.exports = { discoverAllRoutes, LOCALES, MODALITY_SLUGS, STATIC_PATHS };
