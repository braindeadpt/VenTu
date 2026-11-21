#!/usr/bin/env node
/**
 * Regenerates `src/lib/spots.ts` from `src/lib/spots.json` — the single spots
 * catalog shared by the site and the pipeline scripts (audit 2026-11-21).
 *
 * spots.ts keeps the same literal shape it always had (one `id: '…'` block per
 * spot, `];` terminator) so the legacy regex consumers that still parse it
 * (validate-spots, generate-sitemap, fetch-*) keep working.
 *
 * Usage:
 *   node scripts/build-spots-catalog.js          # rewrites src/lib/spots.ts
 *   node scripts/build-spots-catalog.js --check  # exits 1 if spots.ts is stale
 */
const fs = require('fs');
const path = require('path');

const { SPOTS_CATALOG_PATH, loadSpotsCatalog } = require('./lib/spotsCatalog');
const OUT_PATH = path.join(__dirname, '../src/lib/spots.ts');

function tsEscape(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Serializes a JSON value as a TS literal (single-quoted strings). */
function tsLiteral(value) {
  if (typeof value === 'string') return `'${tsEscape(value)}'`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(tsLiteral).join(', ')}]`;
  if (value && typeof value === 'object') {
    return `{ ${Object.entries(value)
      .map(([k, v]) => `${k}: ${tsLiteral(v)}`)
      .join(', ')} }`;
  }
  throw new Error(`unsupported value in spots.json: ${JSON.stringify(value)}`);
}

function entryTs(spot) {
  const lines = Object.entries(spot).map(([k, v]) => `      ${k}: ${tsLiteral(v)},`);
  return `  {\n${lines.join('\n')}\n    },`;
}

const HEADER = `// GENERATED FILE — do not edit by hand.
// Source of truth: src/lib/spots.json (shared with the data pipeline).
// Regenerate with: npm run spots:catalog
`;

function render(spots) {
  return `${HEADER}
import { Spot } from '@/types';

export const spots: Spot[] = [
${spots.map(entryTs).join('\n')}
];

export const getSpotBySlug = (slug: string): Spot | undefined =>
  spots.find(s => s.slug === slug);
`;
}

function main() {
  const check = process.argv.includes('--check');
  const spots = loadSpotsCatalog();
  const next = render(spots);
  const current = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : '';
  if (check) {
    if (current !== next) {
      console.error(
        '❌ src/lib/spots.ts is stale — run `npm run spots:catalog` to regenerate it from src/lib/spots.json',
      );
      process.exit(1);
    }
    console.log(`✅ spots:catalog — src/lib/spots.ts is in sync with src/lib/spots.json (${spots.length} spots)`);
    return;
  }
  fs.writeFileSync(OUT_PATH, next);
  console.log(`📋 Regenerated src/lib/spots.ts from ${path.relative(process.cwd(), SPOTS_CATALOG_PATH)} (${spots.length} spots)`);
}

if (require.main === module) main();

module.exports = { render, tsLiteral };
