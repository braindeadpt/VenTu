const fs = require('fs');
const path = require('path');
const { getSeoLandingSlugs } = require('./seo-landings-slugs');

const BASE_URL = 'https://ventu.surf';
const LOCALES = ['pt', 'en', 'es', 'de', 'fr'];
const MODALITY_SLUGS = ['surf', 'kitesurf', 'windsurf', 'big-wave', 'bodyboard', 'sup', 'foil', 'wakeboard'];

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
  return LOCALES.map(
    (loc) => `    <xhtml:link rel="alternate" hreflang="${loc}" href="${sitemapUrl(`${BASE_URL}/${loc}${localePath}`)}" />`,
  ).join('\n');
}

function addUrl(urls, localePath, { changefreq, priority, lastmod }) {
  for (const locale of LOCALES) {
    const loc = sitemapUrl(`${BASE_URL}/${locale}${localePath}`);
    urls.push({ loc, changefreq, priority, lastmod, localePath });
  }
}

// Read spots from the source file
const spotsPath = path.join(__dirname, '..', 'src', 'lib', 'spots.ts');
const spotsContent = fs.readFileSync(spotsPath, 'utf-8');
const slugMatches = [...spotsContent.matchAll(/slug:\s*['"]([^'"]+)['"]/g)];
const slugs = slugMatches.map((m) => m[1]);

// Read news articles
const newsPath = path.join(__dirname, '..', 'public', 'data', 'news.json');
let newsItems = [];
if (fs.existsSync(newsPath)) {
  try {
    newsItems = JSON.parse(fs.readFileSync(newsPath, 'utf-8'));
  } catch (err) {
    console.warn('⚠️  Could not parse news.json:', err.message);
  }
}

const today = new Date().toISOString().slice(0, 10);
const urlEntries = [];

// Rotas estáticas do [locale] INDEXÁVEIS (as noindex — admin/*, conta,
// diretorio/gerir — ficam de fora de propósito). Manter em sincronia com
// src/app/[locale]/**: cada página estática de lá que não esteja noindex
// tem de estar aqui. Passaporte/diretorio não eram cobertos — adicionados
// 2026-08-31; o guard do ci.yml (check-sitemap-drift.js) tranca a lista.
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

for (const page of staticPages) {
  addUrl(urlEntries, page.path, {
    changefreq: page.changefreq,
    priority: page.priority,
    lastmod: today,
  });
}

for (const slug of MODALITY_SLUGS) {
  addUrl(urlEntries, `/modalidades/${slug}/`, {
    changefreq: 'weekly',
    priority: '0.75',
    lastmod: today,
  });
}

for (const slug of getSeoLandingSlugs()) {
  addUrl(urlEntries, `/explorar/${slug}/`, {
    changefreq: 'weekly',
    priority: '0.8',
    lastmod: today,
  });
}

for (const slug of slugs) {
  addUrl(urlEntries, `/spots/${slug}/`, {
    changefreq: 'hourly',
    priority: '0.85',
    lastmod: today,
  });
}

for (const item of newsItems) {
  const slug = newsSlug(item);
  const lastmod = item.publishedAt ? item.publishedAt.slice(0, 10) : today;
  addUrl(urlEntries, `/news/${slug}/`, {
    changefreq: 'weekly',
    priority: '0.65',
    lastmod,
  });
}

// Directório: perfil de cada escola/loja (public/data/directory.json, mesmo
// ficheiro que o loadDirectoryEntries de src/lib/directory.ts lê). Cada entry
// tem a rota /diretorio/{slug}/ indexável com buildPageMetadata (hreflang).
// Sem ficheiro (dev sem dados) degrada para zero entries — como o news.json.
const directoryPath = path.join(__dirname, '..', 'public', 'data', 'directory.json');
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

for (const slug of directorySlugs) {
  addUrl(urlEntries, `/diretorio/${slug}/`, {
    changefreq: 'weekly',
    priority: '0.6',
    lastmod: today,
  });
}

// Deduplicate by loc (safety)
const seen = new Set();
const uniqueEntries = urlEntries.filter((entry) => {
  if (seen.has(entry.loc)) return false;
  seen.add(entry.loc);
  return true;
});

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
`;

for (const entry of uniqueEntries) {
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

const outputPath = path.join(__dirname, '..', 'public', 'sitemap.xml');
fs.writeFileSync(outputPath, xml);

const staticCount = staticPages.length * LOCALES.length;
const modalityCount = MODALITY_SLUGS.length * LOCALES.length;
const spotCount = slugs.length * LOCALES.length;
const newsCount = newsItems.length * LOCALES.length;

console.log(`✅ Sitemap generated with ${uniqueEntries.length} URLs`);
console.log(`   - Static pages: ${staticCount}`);
console.log(`   - Modalidades: ${modalityCount}`);
console.log(`   - Spot detail pages: ${spotCount}`);
console.log(`   - News articles: ${newsCount}`);
console.log(`   - Saved to: ${outputPath}`);
