/**
 * Built-bundle hydration-beacon check (pure logic — shared by the
 * scripts/check-hydration-beacon.js CLI and its vitest tests).
 *
 * The beacon stamps `html.is-hydrated` — the single readiness signal the CSS
 * gates (html:not(.is-hydrated) [data-hydration-gate=...]) and the e2e
 * waitHydrated selector both hang off. The vitest contract guards the SOURCE
 * (src/components/HydrationBeacon.tsx still calls classList.add), but a build
 * can still silently drop it — beacon removed from the layout import, chunk
 * misconfigured — leaving the source intact and the bundle without the setter.
 * This matcher proves the setter shipped in the BUILT chunks.
 */
const fs = require('fs');
const path = require('path');

/**
 * Minification-safe matcher. The class name is a string literal (minifiers
 * never rename string values) and classList.add survives variable renaming
 * (document.documentElement → e); whitespace between tokens is tolerated.
 * The built form observed in prod is exactly
 * `document.documentElement.classList.add("is-hydrated")`.
 */
const SETTER_RE = /classList\s*\.\s*add\s*\(\s*["']is-hydrated["']\s*\)/;

/** True when a single built chunk contains the setter. */
function findHydrationSetterInChunk(chunkPath) {
  return SETTER_RE.test(fs.readFileSync(chunkPath, 'utf-8'));
}

/**
 * Scan the built chunks dir (out/_next/static/chunks) for the setter.
 * Returns { found, chunk, jsChunks } — chunk is the first match (relative
 * to outDir), jsChunks is the full scan list for diagnostics on failure.
 */
function findHydrationSetter(outDir = 'out') {
  const chunksDir = path.join(outDir, '_next', 'static', 'chunks');
  if (!fs.existsSync(chunksDir)) {
    return { found: false, chunk: null, jsChunks: [] };
  }
  const jsChunks = fs
    .readdirSync(chunksDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(chunksDir, f));
  for (const file of jsChunks) {
    if (findHydrationSetterInChunk(file)) {
      return { found: true, chunk: path.relative(outDir, file), jsChunks };
    }
  }
  return { found: false, chunk: null, jsChunks };
}

module.exports = { SETTER_RE, findHydrationSetter, findHydrationSetterInChunk };