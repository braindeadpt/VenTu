/**
 * Discover all static export routes for E2E audit (mirrors sitemap / generateStaticParams).
 */
const fs = require('fs');
const path = require('path');
const { getSeoLandingSlugs } = require('../../../scripts/seo-landings-slugs');
const { parseSitemapRoutes, NOINDEX_ROUTE_PATHS } = require('../../../scripts/check-export-routes');

const LOCALES = ['pt', 'en', 'es', 'de', 'fr'];
const MODALITY_SLUGS = [
  'surf', 'kitesurf', 'windsurf', 'big-wave', 'bodyboard', 'sup', 'foil', 'wakeboard',
];

/**
 * Per-push browser audit only navigates a deterministic stratified sample of
 * the dynamic-template groups (spot/news/explorar): same template, different
 * data — a hydration defect shows on every instance (historical proof: the
 * #418 clock-skew bug fired 3142×; any sample catches that class). Static and
 * modalidade routes are NEVER sampled: distinct templates, each route unique.
 * HTTP/missing-route coverage for ALL routes moved to the browserless
 * scripts/check-export-routes.js; the unsampled full run lives in the daily
 * full-audit workflow (VENTU_FULL_AUDIT=1) — never lose it, only ungate it
 * from the per-push critical path.
 */
const SAMPLE_SIZES = {
  static: Infinity,
  modalidade: Infinity,
  spot: 40,
  news: 20,
  explorar: 15,
  diretorio: 20,
};

/** Set by the daily full browser audit; CI per-push runs leave it unset. */
function isFullAuditMode() {
  return process.env.VENTU_FULL_AUDIT === '1';
}

/**
 * Deterministic stratified sample: evenly spaced picks over each group's
 * sorted route list (fixed stride from a fixed offset — no randomness, so
 * every run tests the same routes and a failure is reproducible). Full mode
 * returns everything, unchanged.
 * @param {{ path: string, group: string }[]} routes
 * @param {{ full?: boolean }} [opts]
 * @returns {{ path: string, group: string }[]}
 */
function sampleRoutes(routes, opts = {}) {
  const full = opts.full ?? isFullAuditMode();
  if (full) return routes;

  const groups = new Map();
  for (const r of routes) {
    if (!groups.has(r.group)) groups.set(r.group, []);
    groups.get(r.group).push(r);
  }

  const sampled = [];
  for (const [group, members] of groups) {
    const ordered = [...members].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const size = SAMPLE_SIZES[group];
    if (!size || size === Infinity || ordered.length <= size) {
      sampled.push(...ordered);
      continue;
    }
    const stride = ordered.length / size;
    for (let i = 0; i < size; i++) {
      sampled.push(ordered[Math.floor(i * stride)]);
    }
  }
  return sampled;
}

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
  // Percent-encode non-ASCII slugs (e.g. /spots/garrão/ → /spots/garr%C3%A3o/):
  // page.goto() rejects raw non-ASCII paths with "Cannot navigate to invalid
  // URL", and the sitemap publishes the encoded form (RFC 3986). Mirrors
  // scripts/generate-sitemap.js.
  return encodeURI(`/${locale}${normalized}`);
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

  // The sitemap + noindex allowlist are the same contract checked against
  // the export. Include new distinct templates and directory details instead
  // of silently claiming "all routes" with an obsolete manual inventory.
  const known = new Set(routes.map((route) => route.path));
  const sitemap = path.join(__dirname, '../../../public/sitemap.xml');
  const expected = parseSitemapRoutes(sitemap).map((rel) => encodeURI(`/${rel.replace(/index\.html$/, '')}`));
  for (const locale of LOCALES) {
    for (const sub of NOINDEX_ROUTE_PATHS) expected.push(localePath(locale, sub));
  }
  for (const routePath of expected) {
    if (known.has(routePath)) continue;
    known.add(routePath);
    const group = /^\/[^/]+\/diretorio\/(?!gerir\/)[^/]+\/$/.test(routePath) ? 'diretorio' : 'static';
    routes.push({ path: routePath, group });
  }
  return routes;
}

module.exports = {
  discoverAllRoutes,
  sampleRoutes,
  isFullAuditMode,
  SAMPLE_SIZES,
  LOCALES,
  MODALITY_SLUGS,
  STATIC_PATHS,
};
