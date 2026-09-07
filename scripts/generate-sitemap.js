/**
 * Sitemap generator — sitemap index + content-type splits.
 *
 * Live single-file sitemap.xml was ~1.8MB / ~2370 URLs; large static XML + CDN
 * edges intermittently 500 while origin curl still returned 200. Split files
 * keep each urlset smaller and more reliably cacheable.
 *
 * Output (public/):
 *   sitemap.xml              — sitemap index
 *   sitemap-static.xml       — static pages + modalidades
 *   sitemap-explorar.xml     — SEO explorar landings
 *   sitemap-spots.xml        — spot detail pages
 *   sitemap-news.xml         — news articles
 *   sitemap-directory.xml    — directory profiles
 *
 * robots.txt points at the index. Each <url> keeps xhtml hreflang alternates
 * for pt/en/es/de/fr plus x-default → pt (product defaultLocale).
 *
 * Usage: node scripts/generate-sitemap.js
 * Tests require this module (no side effects when required).
 */

const fs = require('fs');
const path = require('path');
const { getSeoLandingSlugs } = require('./seo-landings-slugs');

const BASE_URL = 'https://ventu.surf';
const LOCALES = ['pt', 'en', 'es', 'de', 'fr'];
/** Product canonical / default locale — x-default points here. */
const X_DEFAULT_LOCALE = 'pt';
const MODALITY_SLUGS = ['surf', 'kitesurf', 'windsurf', 'big-wave', 'bodyboard', 'sup', 'foil', 'wakeboard'];

/** Child sitemap filenames (written next to the index under public/). */
const SITEMAP_PARTS = [
  'sitemap-static.xml',
  'sitemap-explorar.xml',
  'sitemap-spots.xml',
  'sitemap-news.xml',
  'sitemap-directory.xml',
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

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Percent-encode a URL for the sitemap (RFC 3986 / sitemaps.org protocol).
 * Raw non-ASCII slugs (e.g. /spots/garrão/) must be published as their
 * percent-encoded form (/spots/garr%C3%A3o/): the raw form 404s/400s on
 * static hosts and crawlers use the sitemap URL verbatim. encodeURI leaves
 * reserved chars (/, :, ?) intact and encodes only what RFC 3986 requires.
 */
function sitemapUrl(value) {
  return encodeURI(value);
}

function hreflangLinks(localePath) {
  const links = LOCALES.map(
    (loc) =>
      `    <xhtml:link rel="alternate" hreflang="${loc}" href="${sitemapUrl(`${BASE_URL}/${loc}${localePath}`)}" />`,
  );
  links.push(
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${sitemapUrl(`${BASE_URL}/${X_DEFAULT_LOCALE}${localePath}`)}" />`,
  );
  return links.join('\n');
}

function addUrl(urls, localePath, { changefreq, priority, lastmod }) {
  for (const locale of LOCALES) {
    const loc = sitemapUrl(`${BASE_URL}/${locale}${localePath}`);
    urls.push({ loc, changefreq, priority, lastmod, localePath });
  }
}

function dedupeByLoc(urlEntries) {
  const seen = new Set();
  return urlEntries.filter((entry) => {
    if (seen.has(entry.loc)) return false;
    seen.add(entry.loc);
    return true;
  });
}

function renderUrlset(entries) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
`;
  for (const entry of entries) {
    xml += `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
${hreflangLinks(entry.localePath)}
  </url>
`;
  }
  xml += '</urlset>\n';
  return xml;
}

function renderSitemapIndex(parts, lastmod) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;
  for (const file of parts) {
    xml += `  <sitemap>
    <loc>${escapeXml(sitemapUrl(`${BASE_URL}/${file}`))}</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>
`;
  }
  xml += '</sitemapindex>\n';
  return xml;
}

/**
 * Build bucketed URL entries from repo data sources.
 * @param {{ rootDir?: string, today?: string }} [opts]
 */
function collectSitemapBuckets(opts = {}) {
  const rootDir = opts.rootDir || path.join(__dirname, '..');
  const today = opts.today || new Date().toISOString().slice(0, 10);

  const staticPages = [
    { path: '/', priority: '1.0', changefreq: 'daily' },
    { path: '/mapa/', priority: '0.95', changefreq: 'daily' },
    { path: '/explorar/', priority: '0.85', changefreq: 'weekly' },
    { path: '/spots/', priority: '0.9', changefreq: 'daily' },
    { path: '/livecams/', priority: '0.85', changefreq: 'weekly' },
    { path: '/alerts/', priority: '0.75', changefreq: 'weekly' },
    { path: '/favorites/', priority: '0.7', changefreq: 'weekly' },
    { path: '/compare/', priority: '0.6', changefreq: 'weekly' },
    { path: '/news/', priority: '0.8', changefreq: 'daily' },
    { path: '/about/', priority: '0.5', changefreq: 'monthly' },
    { path: '/fontes/', priority: '0.5', changefreq: 'monthly' },
    { path: '/sazonalidade/', priority: '0.6', changefreq: 'monthly' },
    { path: '/ferramentas/', priority: '0.7', changefreq: 'monthly' },
    { path: '/ferramentas/calculadora-kite/', priority: '0.75', changefreq: 'monthly' },
    { path: '/ferramentas/calculadora-fato/', priority: '0.75', changefreq: 'monthly' },
    { path: '/passaporte/', priority: '0.6', changefreq: 'weekly' },
    { path: '/diretorio/', priority: '0.6', changefreq: 'weekly' },
  ];

  const staticEntries = [];
  for (const page of staticPages) {
    addUrl(staticEntries, page.path, {
      changefreq: page.changefreq,
      priority: page.priority,
      lastmod: today,
    });
  }
  for (const slug of MODALITY_SLUGS) {
    addUrl(staticEntries, `/modalidades/${slug}/`, {
      changefreq: 'weekly',
      priority: '0.75',
      lastmod: today,
    });
  }

  const explorarEntries = [];
  for (const slug of getSeoLandingSlugs()) {
    addUrl(explorarEntries, `/explorar/${slug}/`, {
      changefreq: 'weekly',
      priority: '0.8',
      lastmod: today,
    });
  }

  const spotsPath = path.join(rootDir, 'src', 'lib', 'spots.ts');
  const spotsContent = fs.readFileSync(spotsPath, 'utf-8');
  const slugs = [...spotsContent.matchAll(/slug:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const spotEntries = [];
  for (const slug of slugs) {
    addUrl(spotEntries, `/spots/${slug}/`, {
      changefreq: 'hourly',
      priority: '0.85',
      lastmod: today,
    });
  }

  const newsPath = path.join(rootDir, 'public', 'data', 'news.json');
  let newsItems = [];
  if (fs.existsSync(newsPath)) {
    try {
      newsItems = JSON.parse(fs.readFileSync(newsPath, 'utf-8'));
    } catch (err) {
      console.warn('⚠️  Could not parse news.json:', err.message);
    }
  }
  const newsEntries = [];
  for (const item of newsItems) {
    const slug = newsSlug(item);
    const lastmod = item.publishedAt ? item.publishedAt.slice(0, 10) : today;
    addUrl(newsEntries, `/news/${slug}/`, {
      changefreq: 'weekly',
      priority: '0.65',
      lastmod,
    });
  }

  const directoryPath = path.join(rootDir, 'public', 'data', 'directory.json');
  let directorySlugs = [];
  if (fs.existsSync(directoryPath)) {
    try {
      const directory = JSON.parse(fs.readFileSync(directoryPath, 'utf-8'));
      directorySlugs = Array.isArray(directory.entries)
        ? directory.entries
            .map((e) => (e && typeof e.slug === 'string' ? e.slug : null))
            .filter(Boolean)
        : [];
    } catch (err) {
      console.warn('⚠️  Could not parse directory.json:', err.message);
    }
  }
  const directoryEntries = [];
  for (const slug of directorySlugs) {
    addUrl(directoryEntries, `/diretorio/${slug}/`, {
      changefreq: 'weekly',
      priority: '0.6',
      lastmod: today,
    });
  }

  return {
    today,
    buckets: {
      'sitemap-static.xml': dedupeByLoc(staticEntries),
      'sitemap-explorar.xml': dedupeByLoc(explorarEntries),
      'sitemap-spots.xml': dedupeByLoc(spotEntries),
      'sitemap-news.xml': dedupeByLoc(newsEntries),
      'sitemap-directory.xml': dedupeByLoc(directoryEntries),
    },
    counts: {
      static: staticEntries.length,
      explorar: explorarEntries.length,
      spots: spotEntries.length,
      news: newsEntries.length,
      directory: directoryEntries.length,
      spotSlugs: slugs.length,
      newsItems: newsItems.length,
      directorySlugs: directorySlugs.length,
    },
  };
}

/**
 * Write sitemap index + child urlsets under public/.
 * @param {{ rootDir?: string, today?: string }} [opts]
 */
function generateSitemaps(opts = {}) {
  const rootDir = opts.rootDir || path.join(__dirname, '..');
  const publicDir = path.join(rootDir, 'public');
  const { today, buckets, counts } = collectSitemapBuckets({ ...opts, rootDir });

  const written = [];
  for (const file of SITEMAP_PARTS) {
    const entries = buckets[file] || [];
    const outPath = path.join(publicDir, file);
    fs.writeFileSync(outPath, renderUrlset(entries));
    written.push({ file, urls: entries.length, path: outPath });
  }

  const indexPath = path.join(publicDir, 'sitemap.xml');
  fs.writeFileSync(indexPath, renderSitemapIndex(SITEMAP_PARTS, today));
  written.push({ file: 'sitemap.xml', urls: SITEMAP_PARTS.length, path: indexPath, index: true });

  return { today, counts, written, parts: SITEMAP_PARTS };
}

function main() {
  const { counts, written } = generateSitemaps();
  const totalUrls = written.filter((w) => !w.index).reduce((n, w) => n + w.urls, 0);
  console.log(`✅ Sitemap index + ${SITEMAP_PARTS.length} splits (${totalUrls} URLs)`);
  console.log(`   - Static + modalidades: ${counts.static}`);
  console.log(`   - Explorar landings: ${counts.explorar}`);
  console.log(`   - Spot detail pages: ${counts.spots} (${counts.spotSlugs} spots)`);
  console.log(`   - News articles: ${counts.news} (${counts.newsItems} items)`);
  console.log(`   - Directory: ${counts.directory} (${counts.directorySlugs} entries)`);
  for (const w of written) {
    console.log(`   - ${w.file}: ${w.path}`);
  }
}

module.exports = {
  BASE_URL,
  LOCALES,
  X_DEFAULT_LOCALE,
  SITEMAP_PARTS,
  MODALITY_SLUGS,
  slugify,
  newsSlug,
  escapeXml,
  sitemapUrl,
  hreflangLinks,
  addUrl,
  dedupeByLoc,
  renderUrlset,
  renderSitemapIndex,
  collectSitemapBuckets,
  generateSitemaps,
};

if (require.main === module) {
  main();
}
