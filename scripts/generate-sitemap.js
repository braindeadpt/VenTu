const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://ventu.surf';
const LOCALES = ['pt', 'en'];

// Read spots from the source file
const spotsPath = path.join(__dirname, '..', 'src', 'lib', 'spots.ts');
const spotsContent = fs.readFileSync(spotsPath, 'utf-8');

// Extract slugs using regex - looking for slug: '...'
const slugMatches = [...spotsContent.matchAll(/slug:\s*['"]([^'"]+)['"]/g)];
const slugs = slugMatches.map(m => m[1]);

// Static pages
const staticPages = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/spots/', priority: '0.9', changefreq: 'daily' },
  { path: '/favorites/', priority: '0.7', changefreq: 'weekly' },
  { path: '/compare/', priority: '0.6', changefreq: 'weekly' },
  { path: '/news/', priority: '0.8', changefreq: 'daily' },
];

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

// Add static pages for each locale
for (const locale of LOCALES) {
  for (const page of staticPages) {
    xml += `  <url>
    <loc>${BASE_URL}/${locale}${page.path}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>
`;
  }
}

// Add spot detail pages for each locale
for (const locale of LOCALES) {
  for (const slug of slugs) {
    xml += `  <url>
    <loc>${BASE_URL}/${locale}/spots/${slug}/</loc>
    <changefreq>hourly</changefreq>
    <priority>0.85</priority>
  </url>
`;
  }
}

xml += '</urlset>\n';

const outputPath = path.join(__dirname, '..', 'public', 'sitemap.xml');
fs.writeFileSync(outputPath, xml);

console.log(`✅ Sitemap generated with ${staticPages.length * LOCALES.length + slugs.length * LOCALES.length} URLs`);
console.log(`   - Static pages: ${staticPages.length * LOCALES.length}`);
console.log(`   - Spot detail pages: ${slugs.length * LOCALES.length}`);
console.log(`   - Total spots found: ${slugs.length}`);
console.log(`   - Saved to: ${outputPath}`);
