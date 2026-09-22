/**
 * Atomic JSON write: serialize to `<file>.tmp` then rename(2) over the
 * target. A reader (the Next static export, the site, a validator, the next
 * pipeline step) can never observe a half-written `public/data/*.json` —
 * the 2026-09-22 audit found ~10 writers doing a bare `fs.writeFileSync`
 * straight onto files that production serves while the pipeline is running.
 *
 * Byte-compatible with the call sites it replaces
 * (`JSON.stringify(data, null, 2)`, no trailing newline), so the first
 * regenerating run produces no spurious diff.
 *
 * Same pattern as the in-run `.backup` sidecars: the `.tmp` sibling must
 * never be committed — `.gitignore` has `*.tmp` and push-data-update.sh
 * unstages `*.tmp` alongside `*.backup` (both bypass-proof because that
 * script commits with `git add -f`).
 */
const fs = require('fs');
const path = require('path');

/**
 * @param {string} filePath target path (e.g. `public/data/conditions.json`)
 * @param {unknown} data JSON-serializable value
 */
function atomicWriteJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

module.exports = { atomicWriteJson };
