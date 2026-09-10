/**
 * CI guard: the hydration beacon must survive into the production bundle.
 *
 * HydrationBeacon stamps html.is-hydrated — the single readiness signal the
 * CSS gates (html:not(.is-hydrated) [data-hydration-gate=...]) and the e2e
 * waitHydrated selector both hang off. The vitest contract guards the SOURCE
 * (src/components/HydrationBeacon.tsx still calls classList.add), but a build
 * can still silently drop the beacon — removed from the layout import, chunk
 * misconfigured — leaving the source intact and the bundle without the setter.
 * The CSS gates then never open (hearts/news/dawn slots stay hidden in prod)
 * and every e2e waiting on html.is-hydrated times out, yet the build stays
 * green. This script scans the BUILT chunks and fails the build when the
 * setter is missing.
 *
 * Usage: node scripts/check-hydration-beacon.js [--out-dir <dir>]
 */
const path = require('path');
const { findHydrationSetter } = require('./lib/hydrationBeaconCheck');

const argAt = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const outDir = argAt('--out-dir') || 'out';

const { found, chunk, jsChunks } = findHydrationSetter(outDir);

if (found) {
  console.log(`OK: hydration beacon setter found in ${path.join(outDir, chunk)}`);
  process.exit(0);
}

console.error(
  `FAIL: no classList.add("is-hydrated") setter in ${path.join(
    outDir,
    '_next/static/chunks',
  )} (${jsChunks.length} chunk(s) scanned).`,
);
console.error('HydrationBeacon was stripped from the production bundle: the CSS gates');
console.error('(html:not(.is-hydrated) [data-hydration-gate=...]) never open, so the favorite');
console.error('hearts, news shell and dawn-patrol slots stay hidden in prod, and the e2e');
console.error('waitHydrated never resolves. Restore the beacon in the layout, then rebuild.');
process.exit(1);