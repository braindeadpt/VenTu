#!/usr/bin/env node
/**
 * Shape-gated re-snapshot of the visual-regression data fixture.
 *
 * tests/e2e/visual-regression.spec.ts serves every /data/** request from the
 * COMMITTED fixture at tests/e2e/fixtures/data — never from the build — so a
 * routine data commit moves zero pixels and baselines stay green (see the
 * spec header for the full reasoning). The fixture must be refreshed
 * DELIBERATELY, only when the data SHAPE changes — not the values:
 *
 *   - a new spot added to / removed from the spot set (card/marker counts);
 *   - a new data file becomes layout-relevant on a captured route;
 *   - a schema change renames/restructures an existing file.
 *
 * SHAPE is defined as the JSON skeleton: object keys (sorted), nesting and
 * scalar VALUE TYPES — deliberately NOT scalar values and NOT array lengths.
 * Values (scores, wave heights, dates) never need a re-sync: they are masked
 * and/or pinned by the fixture as-is, and re-syncing them churns the repo by
 * value (the f8481d8f8 record rewrote 194 files / 36k lines of pure value
 * churn). Array lengths are excluded on purpose: time-series files grow a row
 * per pipeline run (skill pairs, coherence trend) and those zones are masked
 * as units; a NEW spot changes object keys and is therefore caught.
 *
 * radar/** is excluded entirely: frame filenames rotate with every refresh,
 * the carousel is masked in captures, and the spec's build-snapshot fallback
 * serves it — copying frames would churn 1.7MB of dead pixels per record.
 *
 * Usage:  npm run build && node scripts/sync-visual-fixture.mjs
 *         (requires a fresh `out/`; only structurally-changed files are
 *          copied, everything else is reported as skipped)
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';

const root = process.cwd();
const src = join(root, 'out', 'data');
const dest = join(root, 'tests', 'e2e', 'fixtures', 'data');

/** JSON structural skeleton: object keys sorted, nesting, scalar types. */
function skeleton(v) {
  if (Array.isArray(v)) {
    return { t: 'array', el: v.length ? skeleton(v[0]) : null };
  }
  if (v && typeof v === 'object') {
    const out = { t: 'object' };
    for (const k of Object.keys(v).sort()) out[k] = skeleton(v[k]);
    return out;
  }
  return { t: typeof v };
}

function shapeHash(text) {
  return createHash('sha1').update(JSON.stringify(skeleton(JSON.parse(text)))).digest('hex');
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

if (!existsSync(src)) {
  console.error(`❌ ${src} not found — run \`npm run build\` first.`);
  process.exit(1);
}

const EXCLUDED = ['radar']; // volatile masked frames — see header
// rel uses the OS separator (\\ on Windows) — normalize so the prefix check
// matches radar/ regardless of platform; this bug copied 25 radar frames
// into the fixture on a local Windows run.
const isExcluded = (rel) => {
  const norm = rel.split('\\').join('/');
  return EXCLUDED.some((d) => norm === d || norm.startsWith(`${d}/`));
};

let copied = 0;
let skipped = 0;
let deleted = 0;

for (const f of walk(src)) {
  const rel = relative(src, f);
  if (isExcluded(rel)) continue;
  const out = join(dest, rel);
  if (f.endsWith('.json')) {
    const buildHash = shapeHash(readFileSync(f, 'utf8'));
    if (existsSync(out)) {
      const fixtureHash = shapeHash(readFileSync(out, 'utf8'));
      if (buildHash === fixtureHash) {
        skipped += 1;
        continue;
      }
    }
  } else if (existsSync(out)) {
    // Non-JSON (binaries): keep the committed copy — byte diffs here are
    // value churn (e.g. generated images), not shape.
    skipped += 1;
    continue;
  }
  mkdirSync(dirname(out), { recursive: true });
  copyFileSync(f, out);
  copied += 1;
}

// Removal pass: fixture JSONs that no longer exist in the build are a shape
// change — drop them so the fixture mirrors the set. Non-JSON and excluded
// paths (radar) are never deleted.
for (const f of walk(dest)) {
  const rel = relative(dest, f);
  if (isExcluded(rel) || !f.endsWith('.json')) continue;
  if (!existsSync(join(src, rel))) {
    rmSync(f, { force: true });
    deleted += 1;
  }
}

console.log(
  `✅ Fixture synced: ${copied} copied (shape change / new), ${skipped} skipped (value-only), ${deleted} deleted.`,
);
if (copied === 0 && deleted === 0) {
  console.log('No structural change — the committed fixture already matches this build shape.');
}
console.log('Next: re-record the visual baselines on Linux (record-visual-baselines workflow).');