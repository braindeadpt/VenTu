#!/usr/bin/env node
/**
 * Re-snapshot the visual-regression data fixture from the current build.
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
 * Values alone (scores, wave heights, dates) NEVER need a re-sync — they are
 * masked and/or pinned by the fixture as-is. After a sync, the visual
 * baselines must be re-recorded (record-visual-baselines workflow on Linux),
 * because the rendered layout now reflects the new fixture.
 *
 * Usage:  npm run build && node scripts/sync-visual-fixture.mjs
 *         (requires a fresh `out/`; the script copies out/data verbatim)
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const src = join(root, 'out', 'data');
const dest = join(root, 'tests', 'e2e', 'fixtures', 'data');

if (!existsSync(src)) {
  console.error(`❌ ${src} not found — run \`npm run build\` first.`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`✅ Fixture re-synced: ${src} → ${dest}`);
console.log('Next: re-record the visual baselines on Linux (record-visual-baselines workflow).');