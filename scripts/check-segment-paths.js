/**
 * CI guard: after `npm run build` (which runs fixup-next-segment-paths.js),
 * no nested __next.* payload directories may remain in out/.
 *
 * If this fails, a Next.js upgrade changed the segment-cache layout and
 * fixup-next-segment-paths.js needs a matching update — otherwise every
 * <Link> prefetch would 404 again in production.
 * https://github.com/vercel/next.js/issues/85374
 */
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'out');

function findNested(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('__next.')) out.push(full);
    else findNested(full, out);
  }
}

const nested = [];
findNested(OUT_DIR, nested);
if (nested.length > 0) {
  console.error(
    `check-segment-paths: ${nested.length} nested segment payload dir(s) remain in out/:\n` +
      nested.slice(0, 10).join('\n') +
      '\nRun scripts/fixup-next-segment-paths.js after build (see issue #85374).',
  );
  process.exit(1);
}
console.log('check-segment-paths: OK — no nested segment payload dirs');
