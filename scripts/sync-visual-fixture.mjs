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
 *   - a new spot added to the spot set (card/marker counts) — keys and files
 *     only in the fixture are KEPT (see mergeShape), so a removed spot or file
 *     is pruned from the fixture by hand;
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
 * When conditions.json or a forecasts/ file changed, the fixture's `notaV6`
 * («agora») is recomputed from the fixture's own inputs at the fixture instant
 * (map-hours.json generatedAt) with scripts/build-nota-v6-agora.js — the merge
 * would otherwise graft live keys (e.g. `notaV6.sem`) onto fixture values.
 *
 * Usage:  npm run build && node scripts/sync-visual-fixture.mjs
 *         (requires a fresh `out/`; only structurally-changed files are
 *          copied, everything else is reported as skipped)
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeShape, skeleton } from './lib/visualFixtureShape.mjs';

const root = process.cwd();
const src = join(root, 'out', 'data');
const dest = join(root, 'tests', 'e2e', 'fixtures', 'data');

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
let merged = 0;
let skipped = 0;
/** Ficheiros que a nota v6 «agora» lê (conditions.json + séries por spot). */
const notaInputs = (rel) => {
  const norm = rel.split('\\').join('/');
  return norm === 'conditions.json' || norm.startsWith('forecasts/');
};
let notaInputsChanged = false;

for (const f of walk(src)) {
  const rel = relative(src, f);
  if (isExcluded(rel)) continue;
  const out = join(dest, rel);
  if (f.endsWith('.json')) {
    const buildText = readFileSync(f, 'utf8');
    const buildHash = shapeHash(buildText);
    if (existsSync(out)) {
      const fixtureText = readFileSync(out, 'utf8');
      const fixtureHash = shapeHash(fixtureText);
      if (buildHash === fixtureHash) {
        skipped += 1;
        continue;
      }
      // Shape changed: fold the build's skeleton into the committed fixture
      // while KEEPING the fixture's scalar values. A value rewrite here would
      // flip data-dependent layout (TopNow grid columns) and strand every
      // baseline recorded against the previous values — see visualFixtureShape.
      const fixtureValue = JSON.parse(fixtureText);
      const mergedValue = mergeShape(fixtureValue, JSON.parse(buildText));
      // The merge keeps fixture values, fixture-only keys and null-vs-value
      // flips, so a skeleton mismatch often merges back to the very same
      // fixture — don't rewrite (re-format/re-order) an unchanged file.
      if (JSON.stringify(mergedValue) === JSON.stringify(fixtureValue)) {
        skipped += 1;
        continue;
      }
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify(mergedValue, null, 2)}\n`);
      merged += 1;
      if (notaInputs(rel)) notaInputsChanged = true;
      continue;
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
  if (notaInputs(rel)) notaInputsChanged = true;
}

// O merge copia as chaves novas do build com os valores live (ex. `notaV6.sem`)
// para linhas cujos valores continuam os da fixture — a nota v6 «agora» ficava
// incoerente com os inputs da própria fixture. Recalcula-se com o mesmo writer
// do pipeline, no instante fixo da fixture (map-hours.generatedAt), para o
// resultado não depender do relógio (frescura da boia).
if (notaInputsChanged) recomputeNotaV6();

function recomputeNotaV6() {
  const mhPath = join(dest, 'map-hours.json');
  let nowIso = null;
  try {
    nowIso = JSON.parse(readFileSync(mhPath, 'utf8')).generatedAt ?? null;
  } catch {
    /* sem map-hours legível */
  }
  if (typeof nowIso !== 'string' || !Number.isFinite(Date.parse(nowIso))) {
    console.warn('⚠️ notaV6 da fixture NÃO recalculada: map-hours.json sem generatedAt (instante da fixture).');
    return;
  }
  const builder = join(dirname(fileURLToPath(import.meta.url)), 'build-nota-v6-agora.js');
  const r = spawnSync(process.execPath, [builder], {
    cwd: root,
    env: { ...process.env, VENTU_DATA_DIR: dest, VENTU_NOW_ISO: nowIso },
    encoding: 'utf8',
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  // O builder nunca sai com erro (num falhanço tira a notaV6 e avisa): o aviso
  // ::warning do stdout é o sinal.
  if (r.status !== 0 || /::warning title=notaV6/.test(r.stdout ?? '')) {
    console.error('❌ Recálculo da notaV6 da fixture falhou — ver acima.');
    process.exit(1);
  }
  console.log(`🎯 notaV6 da fixture recalculada no instante da fixture (${nowIso}).`);
}

// Fixture JSONs absent from the build are KEPT, not deleted: tests read files
// the live data no longer publishes (the aggregated forecasts.json, gone from
// public/data since 25/10/2026, is still loaded by motorUnicoGolden.test.ts),
// and a branch may add a file before the pipeline does — the same reason
// mergeShape keeps fixture-only keys. Listed so a human can prune deliberately.
const fixtureOnly = [];
for (const f of walk(dest)) {
  const rel = relative(dest, f);
  if (isExcluded(rel) || !f.endsWith('.json')) continue;
  if (!existsSync(join(src, rel))) fixtureOnly.push(rel.split('\\').join('/'));
}

console.log(
  `✅ Fixture synced: ${copied} copied (new), ${merged} merged (shape change, values kept), ${skipped} skipped (value-only), ${fixtureOnly.length} fixture-only kept${
    fixtureOnly.length ? ` (${fixtureOnly.join(', ')})` : ''
  }.`,
);
if (copied === 0 && merged === 0) {
  console.log('No structural change — the committed fixture already matches this build shape.');
}
console.log('Next: re-record the visual baselines on Linux (record-visual-baselines workflow).');