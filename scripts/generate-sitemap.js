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

function hreflangLinks(localePath) {
  return LOCALES.map(
    (loc) => `    <xhtml:link rel="alternate" hreflang="${loc}" href="${BASE_URL}/${loc}${localePath}" />`,
  ).join('\n');
}

function addUrl(urls, localePath, { changefreq, priority, lastmod }) {
  for (const locale of LOCALES) {
    const loc = `${BASE_URL}/${locale}${localePath}`;
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
  { path: '/sazonalidade/', priority: '0.6', changefreq: 'monthly' },
  { path: '/ferramentas/', priority: '0.7', changefreq: 'monthly' },
  { path: '/ferramentas/calculadora-kite/', priority: '0.75', changefreq: 'monthly' },
  { path: '/ferramentas/calculadora-fato/', priority: '0.75', changefreq: 'monthly' },
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
