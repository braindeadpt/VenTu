/**
 * Flatten Next.js 16 segment-cache RSC payload paths for static export.
 *
 * Upstream bug: https://github.com/vercel/next.js/issues/85374
 *
 * `next build` (output: 'export', Next 16) writes segment payloads as nested
 * directories:
 *
 *   out/pt/diretorio/__next.$d$locale/diretorio/__PAGE__.txt
 *
 * but the client router prefetches a dot-joined flat filename:
 *
 *   /pt/diretorio/__next.$d$locale.diretorio.__PAGE__.txt
 *
 * The browser's request can never succeed, so EVERY <Link> prefetch on every
 * route logs a 404 console error and prefetching is silently dead. The build
 * already emits the flat sibling payload (__next.$d$locale.txt) for the page
 * segment, so we rewrite each nested __PAGE__.txt to the exact flat path the
 * client asks for (its content is the page-segment RSC payload, which is what
 * the prefetch wants back).
 *
 * Idempotent: re-running finds no remaining nested dirs and exits 0.
 * Run after `next build`; wired into the "build" npm script and CI.
 */
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'out');

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith('__next.')) out.push(full);
      else walk(full, out);
    }
  }
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    console.error('fixup-next-segment-paths: out/ not found — run next build first');
    process.exit(1);
  }

  const nestedDirs = [];
  walk(OUT_DIR, nestedDirs);
  if (nestedDirs.length === 0) {
    console.log('fixup-next-segment-paths: no nested segment dirs (already flat)');
    return;
  }

  let moved = 0;
  for (const dir of nestedDirs) {
    // Flattened name: every path component from the __next.* dir downwards,
    // joined with dots. out/pt/diretorio/__next.$d$locale/diretorio/__PAGE__.txt
    //  -> out/pt/diretorio/__next.$d$locale.diretorio.__PAGE__.txt
    const rel = path.relative(OUT_DIR, dir);
    const parts = rel.split(path.sep);
    const idx = parts.findIndex((p) => p.startsWith('__next.'));
    if (idx === -1) continue;
    const flatName = parts.slice(idx).join('.');

    // Each nested dir holds exactly one __PAGE__.txt payload (segment cache
    // layout); rewrite it to the flat dot-joined filename the client fetches.
    for (const file of walkFiles(dir)) {
      const tail = path.relative(dir, file).split(path.sep).join('.');
      const target = path.join(OUT_DIR, path.dirname(rel), `${flatName}.${tail}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(file, target);
      moved += 1;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(`fixup-next-segment-paths: flattened ${moved} RSC payload(s) into dot-joined filenames`);
}

function* walkFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkFiles(full);
    else yield full;
  }
}

main().catch((err) => {
  console.error('fixup-next-segment-paths failed:', err);
  process.exit(1);
});
