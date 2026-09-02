/**
 * Validates spot data integrity — run in CI or locally before deploy.
 * Usage: node scripts/validate-spots.js
 */

const fs = require('fs');
const path = require('path');

const spotsPath = path.join(__dirname, '../src/lib/spots.ts');
const content = fs.readFileSync(spotsPath, 'utf8');

const ids = [...content.matchAll(/^\s+id: '([^']+)'/gm)];
const errors = [];

const re = /id: '([^']+)'[\s\S]*?(?=^\s+id: '|^\];)/gm;
let m;

/** Slugs become URL paths — must stay ASCII/URL-safe. */
const SLUG_RE = /^[a-z0-9-]+$/;
const seenSlugs = new Map();

while ((m = re.exec(content))) {
  const block = m[0];
  const id = m[1];
  const type = (block.match(/type: '([^']+)'/) || [])[1];

  if (!block.includes('compatibleSports:')) {
    errors.push(`Spot "${id}" (${type || 'unknown'}) missing compatibleSports`);
  }

  const slug = (block.match(/slug: '([^']+)'/) || [])[1];
  if (slug && !SLUG_RE.test(slug)) {
    errors.push(
      `Spot "${id}": slug "${slug}" is not ASCII/URL-safe. Accented slugs cause a ` +
      `silent 404 client-side after hydration (see commit 63cffbcf5) — use the ` +
      `unaccented form (ex.: garrão → garrao). The id may keep accents: it is a ` +
      `data key, never a URL.`
    );
  }
  if (slug) {
    if (seenSlugs.has(slug)) {
      errors.push(`Duplicate slug "${slug}": spots "${seenSlugs.get(slug)}" and "${id}" generate the same route — one page silently overwrites the other in the static export.`);
    } else {
      seenSlugs.set(slug, id);
    }
  }
}

if (errors.length > 0) {
  console.error(`❌ validate-spots: ${errors.length} issue(s)\n`);
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}

console.log(`✅ validate-spots: ${ids.length} spots OK — all have compatibleSports, ASCII-safe unique slugs`);
