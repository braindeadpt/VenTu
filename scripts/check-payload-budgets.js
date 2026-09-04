/**
 * CI guard: listing pages must never re-serialize spot-detail data.
 *
 * Why this exists: 847350f9c baked each spot's full conditions + hourly
 * forecast into the static HTML to fix the spot-page CLS, but the bake lived
 * in the shared loadSpotData() loader. Home, /spots/, /mapa/, explorar and
 * modalidades — every listing route — then serialized all 185 forecasts
 * (31,080 rows) into their HTML + RSC payloads without consuming them:
 * ~22 MB raw per route dir (measured), 2458 KB transfer on home, Perf 52.
 * cb6fb1806 split the loader (loadSpotListings vs loadSpotData), dropping
 * listing payloads to ~2.2 MB per route dir.
 *
 * This guard is mechanism-agnostic: whatever the cause, if a route dir's
 * payloads (index.html + __next.* RSC files, raw bytes) blow past the budget,
 * the build fails. Budgets are ~2.3x today's lean size and ~4x below the
 * regression size, so organic growth (more spots, longer copy) has room, but
 * a reload of the 31k-row bake is caught instantly.
 *
 * Every locale route dir with an index.html is checked, spot pages
 * (spots/<slug>) included — they bake one spot's forecast and sit at ~0.5 MB,
 * so the same bloat would trip them too; the budget only fires on real
 * payload regressions, never on the detail rows each spot page legitimately
 * carries.
 *
 * Usage: node scripts/check-payload-budgets.js [--out-dir <dir>]
 */
const fs = require('fs');
const path = require('path');

const outDir = process.argv.includes('--out-dir')
  ? process.argv[process.argv.indexOf('--out-dir') + 1]
  : path.join(__dirname, '..', 'out');

// MB — see header comment for the calibration (lean ~2.2, regression ~22).
const BUDGET_MB = 5;

function dirPayloadBytes(dir) {
  let sum = 0;
  let files = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  for (const name of entries) {
    // The route's own payload: the baked HTML plus the RSC/prefetch files
    // (__next.$d$locale*.txt, __next._full.txt, ...). Never descend into
    // subdirectories — spots/<slug> pages are not listings.
    if (/^index\.html$|^__next/.test(name)) {
      const full = path.join(dir, name);
      if (!fs.statSync(full).isDirectory()) {
        sum += fs.statSync(full).size;
        files += 1;
      }
    }
  }
  return { sum, files };
}

/** Listing route dirs for one locale dir, in export order. */
function listingDirs(localeDir) {
  const dirs = [];
  const push = (d) => {
    const full = path.join(localeDir, d);
    // Anchor on the baked HTML: only real routes have one.
    if (fs.existsSync(path.join(full, 'index.html'))) dirs.push(full);
  };
  push('.');
  for (const sub of ['spots', 'mapa', 'explorar', 'modalidades']) {
    push(sub);
    const subFull = path.join(localeDir, sub);
    let entries;
    try {
      entries = fs.readdirSync(subFull, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('__next.')) {
        push(path.join(sub, e.name));
      }
    }
  }
  return dirs;
}

const budgetBytes = BUDGET_MB * 1024 * 1024;
const breaches = [];
let checked = 0;
let locales = [];
try {
  locales = fs.readdirSync(outDir);
} catch {
  console.error(`check-payload-budgets: out/ not found: ${outDir}`);
  process.exit(1);
}

for (const locale of locales) {
  const localeDir = path.join(outDir, locale);
  if (!fs.statSync(localeDir).isDirectory()) continue;
  if (!fs.existsSync(path.join(localeDir, 'index.html'))) continue; // not a locale root
  for (const dir of listingDirs(localeDir)) {
    const { sum, files } = dirPayloadBytes(dir);
    if (!files) continue;
    checked += 1;
    const mb = sum / (1024 * 1024);
    if (sum > budgetBytes) {
      breaches.push(
        `${path.relative(outDir, dir) || '/'}: ${mb.toFixed(1)} MB across ${files} payload file(s) > ${BUDGET_MB} MB budget`,
      );
    }
  }
}

if (breaches.length > 0) {
  console.error(
    `check-payload-budgets: ${breaches.length} listing route(s) over budget — ` +
      'listing pages are re-serializing spot-detail data (forecast rows?):\n' +
      breaches.slice(0, 12).join('\n') +
      '\nDo NOT raise the budget to mask this: trim the loader (see ' +
      'src/lib/load-spot-data.ts — listings must use loadSpotListings, not loadSpotData).',
  );
  process.exit(1);
}
console.log(
  `check-payload-budgets: OK — ${checked} route dirs under ${BUDGET_MB} MB each`,
);
