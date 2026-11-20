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
const { LANG_BY_LOCALE, fixHtmlLang } = require('./lib/htmlLang');

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

  // Run first so an idempotent re-run (no nested dirs) still fixes lang.
  fixHtmlLangPerLocale();

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

/**
 * The root layout hardcodes <html lang="pt-PT"> (a shared static root cannot
 * know the locale at build time). Rewrite the lang attribute in every baked
 * page under each locale directory — not just the locale index — so it is
 * correct server-side for crawlers and no-JS users (issue #457).
 */
function fixHtmlLangPerLocale(outDir = OUT_DIR) {
  let fixed = 0;
  for (const locale of Object.keys(LANG_BY_LOCALE)) {
    const localeDir = path.join(outDir, locale);
    if (!fs.existsSync(localeDir)) continue;
    for (const file of walkFiles(localeDir, isInternalDir)) {
      if (!file.endsWith('.html')) continue;
      const html = fs.readFileSync(file, 'utf8');
      const fixedHtml = fixHtmlLang(html, LANG_BY_LOCALE[locale]);
      if (fixedHtml !== html) {
        fs.writeFileSync(file, fixedHtml);
        fixed += 1;
      }
    }
  }
  console.log(`fixup-next-segment-paths: set <html lang> in ${fixed} baked page(s)`);
}

/** Next internals inside a route dir: payload dirs (__next.*) and chunk
 * assets (_next). Neither can hold a baked page — skip them on walks that
 * are only interested in *.html. */
const isInternalDir = (name) => name.startsWith('__next.') || name.startsWith('_next');

function* walkFiles(dir, skipDir = () => false) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!skipDir(e.name)) yield* walkFiles(full, skipDir);
    } else yield full;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('fixup-next-segment-paths failed:', err);
    process.exit(1);
  });
}

module.exports = { fixHtmlLang, fixHtmlLangPerLocale, LANG_BY_LOCALE };
