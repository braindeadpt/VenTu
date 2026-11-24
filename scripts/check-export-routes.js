/**
 * Export route validator (CI, browserless).
 *
 * Replaces the HTTP half of the browser route audit (tests/e2e/
 * full-audit.routes.spec.ts): the site is a static export served by `npx
 * serve out`, so "route responds 200" is equivalent to "out/<route>/index.html
 * exists". Checking that in the filesystem takes seconds for all ~2300 routes
 * instead of ~14 minutes of real navigation — coverage stays total on the
 * cheap dimension, and the browser audit keeps only what a browser can catch
 * (uncaught JS), on a deterministic sample.
 *
 * Expectations come from public/sitemap.xml — the authoritative, drift-guarded
 * route list (check-sitemap-drift.js fails the build if the sitemap and the
 * generators disagree). Deriving from it avoids a third copy of the route
 * lists. The sitemap covers the indexable routes; noindex utility routes that
 * are baked and reachable (fontes, passaporte, conta, auth/callback,
 * diretorio/gerir, admin) are checked via an explicit allowlist, so a broken
 * utility page still fails here.
 *
 * Checks (mode=full, the CI default):
 *   1. MISSING   — every sitemap URL has a baked index.html. Closes a gap no
 *                  other validator covers: generateStaticParams dropping a
 *                  page, or a notFound() reachable at build time, silently
 *                  removing a route while the sitemap still lists it.
 *   2. NOT_FOUND — no baked index.html contains the localized not-found
 *                  heading: a route dir that exists but baked the 404 page is
 *                  a page generateStaticParams silently failed to produce
 *                  (Next renders notFound() into the static HTML).
 *   3. SIZE      — no baked index.html below MIN_HTML_BYTES: a near-empty
 *                  shell means a page that prerendered nothing.
 *   4. EXTRA     — no baked route dir is unknown to the sitemap AND not in
 *                  the noindex allowlist: one half of the forecasts.
 *                  splitFiles incident class (run 34417997202) — a generator
 *                  writing an orphan the index never references.
 *   5. LANG      — every baked index.html carries its own locale's <html
 *                  lang>: the shared static root layout hardcodes pt-PT and
 *                  fixup-next-segment-paths rewrites it per locale, so a page
 *                  still advertising the wrong lang means the fixup did not
 *                  reach it (issue #457).
 *
 * Modes:
 *   --mode=full    all five checks (default). Used in CI after Build.
 *   --mode=extra   only the EXTRA check. Used by the daily full browser
 *                  audit: its flat route list goes stale between runs, so it
 *                  must not red-flag legitimately new routes.
 *   --mode=missing checks 1+2+3+5 (no extra scan).
 *
 * Usage:
 *   node scripts/check-export-routes.js [--out-dir <dir>] [--mode=full|extra|missing]
 *   exit 0 = all good; exit 1 = problems (named, capped at 20 lines)
 */

const fs = require('fs');
const path = require('path');
const { LANG_BY_LOCALE, HTML_LANG_RE } = require('./lib/htmlLang');

const LOCALES = ['pt', 'en', 'es', 'de', 'fr'];

/** Baked, reachable, deliberately noindex utility routes — the sitemap does
 * not list them, but a broken one must still fail this check. */
const NOINDEX_ROUTE_PATHS = [
  '/fontes/',
  '/passaporte/',
  '/conta/',
  '/auth/callback/',
  '/diretorio/gerir/',
  '/admin/contributions/',
  '/admin/diretorio/',
  // Alert e-mail landing pages (confirm/unsubscribe) are one-shot user-facing
  // URLs — never indexed, but they bake and must keep working.
  '/alerts/confirm/',
  '/alerts/unsubscribe/',
];

/** Baked routes legitimately outside the sitemap beyond the fixed allowlist
 * (dynamic paths): es/de/fr news articles are noindex duplicates of the EN
 * text (issue #457) — baked, reachable, deliberately unindexed. */
const NOINDEX_BAKED_PATTERNS = [/^(es|de|fr)\/news\/[^/]+\/index\.html$/];

/** A baked page smaller than this has prerendered nothing useful. */
const MIN_HTML_BYTES = 500;

/** Localized not-found headings (mirrors NotFoundContent). */
const NOT_FOUND_MARKERS = [
  Buffer.from('Página não encontrada', 'utf8'),
  Buffer.from('Page not found', 'utf8'),
];

/** Diagnostics cap — a systemic failure must not dump 2300 lines. */
const REPORT_LIMIT = 20;

/**
 * Parse the sitemap <loc> URLs into filesystem-relative route paths
 * ("pt/spots/garrao/index.html"). URLs are path-only here (NEXT_PUBLIC_BASE_PATH
 * is empty in CI builds); non-ASCII segments are percent-decoded because the
 * export writes real (decoded) filenames.
 */
function sitemapLocToRelPath(loc, origin = 'https://ventu.surf') {
  const prefix = `${origin}/`;
  if (!loc.startsWith(prefix)) return null;
  const routePath = decodeURIComponent(loc.slice(prefix.length));
  if (!routePath || routePath.includes('..')) return null;
  return `${routePath.replace(/\/+$/, '')}/index.html`;
}

function parseSitemapRoutes(sitemapPath) {
  const xml = fs.readFileSync(sitemapPath, 'utf-8');
  const routes = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml))) {
    const rel = sitemapLocToRelPath(m[1]);
    if (rel) routes.push(rel);
  }
  return routes;
}

/**
 * Find every baked route dir under <outDir>/<locale>/, as the same
 * "locale/.../index.html" shape.
 */
function findBakedRoutes(outDir) {
  const baked = [];
  for (const locale of LOCALES) {
    walk(path.join(outDir, locale), locale);
  }

  function walk(dir, rel) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const relPath = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        // Next internals live inside route dirs (e.g. out/pt/__next.*.txt at
        // the locale root, chunk assets under _next/): neither is a route.
        if (e.name.startsWith('__next.') || e.name.startsWith('_next')) continue;
        walk(path.join(dir, e.name), relPath);
      } else if (e.name === 'index.html') {
        baked.push(relPath);
      }
    }
  }

  return baked;
}

/** An index.html that baked the not-found page ('not-found'), a near-empty
 * shell ('size'), or a missing/wrong locale <html lang> ('bad-lang'); null
 * when the page looks healthy. `expectedLang` is optional so callers without
 * a locale keep the old size/not-found-only behaviour. */
function classifyBakedPage(htmlPath, bytes, expectedLang) {
  if (bytes < MIN_HTML_BYTES) return 'size';
  const html = fs.readFileSync(htmlPath);
  if (NOT_FOUND_MARKERS.some((marker) => html.indexOf(marker) !== -1)) return 'not-found';
  if (expectedLang) {
    const m = HTML_LANG_RE.exec(html.toString('utf8'));
    if (!m || m[2] !== expectedLang) return 'bad-lang';
  }
  return null;
}

/**
 * Pure checker: compare expectations (sitemap + noindex allowlist) against
 * the baked export.
 * @param {{
 *   expected: string[],
 *   baked: string[],
 *   bakedBad?: Map<string, 'not-found'|'size'|'bad-lang'>,
 *   noindexPatterns?: RegExp[],
 * }} p
 */
function checkExportRoutes({ expected, baked, bakedBad = new Map(), noindexPatterns = NOINDEX_BAKED_PATTERNS }) {
  const expectedSet = new Set(expected);
  const bakedSet = new Set(baked);

  const missing = expected.filter((r) => !bakedSet.has(r));
  const extra = baked.filter((r) => !expectedSet.has(r) && !noindexPatterns.some((re) => re.test(r)));
  const notFound = baked.filter((r) => bakedBad.get(r) === 'not-found');
  const size = baked.filter((r) => bakedBad.get(r) === 'size');
  const badLang = baked.filter((r) => bakedBad.get(r) === 'bad-lang');

  return { missing, extra, notFound, size, badLang };
}

/** Parse sitemap <loc> entries from an XML string (pure, for tests). */
function parseSitemapLocs(xml) {
  const routes = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml))) {
    const rel = sitemapLocToRelPath(m[1]);
    if (rel) routes.push(rel);
  }
  return routes;
}

function fmt(problems, label) {
  if (problems.length === 0) return [];
  const lines = [`${label}: ${problems.length}`];
  for (const p of problems.slice(0, REPORT_LIMIT)) lines.push(`  - ${p}`);
  if (problems.length > REPORT_LIMIT) lines.push(`  … and ${problems.length - REPORT_LIMIT} more`);
  return lines;
}

function main() {
  const arg = (name, def) => {
    const i = process.argv.indexOf(name);
    if (i >= 0) return process.argv[i + 1];
    // Também a forma documentada `--name=value` (o full-route-audit invoca
    // `--mode=extra` — sem este ramo corria sempre o modo default).
    const eq = process.argv.find((a) => a.startsWith(`${name}=`));
    return eq ? eq.slice(name.length + 1) : def;
  };
  const outDir = path.resolve(arg('--out-dir', path.join(__dirname, '..', 'out')));
  const mode = arg('--mode', 'full');
  if (!['full', 'extra', 'missing'].includes(mode)) {
    console.error(`❌ --mode inválido: ${mode} (use full|extra|missing)`);
    process.exit(1);
  }

  const srcRoot = path.join(__dirname, '..');
  const sitemapPath = path.join(srcRoot, 'public', 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) {
    console.error('❌ public/sitemap.xml missing — run `npm run sitemap:generate` first');
    process.exit(1);
  }

  const sitemapRoutes = parseSitemapRoutes(sitemapPath);
  const expectedSet = new Set(sitemapRoutes);
  // Artigos es/de/fr: duplicados noindex fora do sitemap, mas obrigatórios
  // como baked — derivados dos slugs EN do sitemap. Sem isto, um
  // generateStaticParams que os deixasse cair passava em silêncio.
  for (const r of sitemapRoutes) {
    const news = /^en\/news\/([^/]+)\/index\.html$/.exec(r);
    if (!news) continue;
    for (const l of ['es', 'de', 'fr']) {
      expectedSet.add(`${l}/news/${news[1]}/index.html`);
    }
  }
  for (const p of NOINDEX_ROUTE_PATHS) {
    for (const l of LOCALES) {
      // Deduplicate on insert: some allowlist entries (fontes, passaporte)
      // are also sitemap URLs — kept in both on purpose, so a future noindex
      // flip of one of them still leaves the allowlist demanding a working
      // baked page.
      expectedSet.add(`${l}${p.replace(/\/+$/, '')}/index.html`);
    }
  }
  const expected = [...expectedSet];

  const baked = findBakedRoutes(outDir);
  if (baked.length === 0) {
    console.error(`❌ no baked index.html found under ${outDir} — run the build first`);
    process.exit(1);
  }

  const bakedBad = new Map();
  for (const r of baked) {
    const full = path.join(outDir, r);
    const verdict = classifyBakedPage(
      full,
      fs.statSync(full).size,
      LANG_BY_LOCALE[r.split('/')[0]],
    );
    if (verdict) bakedBad.set(r, verdict);
  }

  const { missing, extra, notFound, size, badLang } = checkExportRoutes({
    expected,
    baked,
    bakedBad,
  });

  // Rotas fora do sitemap pelo padrão têm de provar o noindex — sem a meta,
  // são duplicados invisíveis para o sitemap E para este checker.
  const noNoindex = baked.filter((r) => {
    if (!NOINDEX_BAKED_PATTERNS.some((re) => re.test(r))) return false;
    return !/name="robots" content="[^"]*noindex/.test(
      fs.readFileSync(path.join(outDir, r), 'utf8'),
    );
  });

  const lines = [];
  if (mode !== 'extra') {
    lines.push(...fmt(noNoindex, 'baked pattern-excluded routes missing the noindex meta'));
    lines.push(...fmt(missing, 'missing routes (indexed or allowlisted, not baked)'));
    lines.push(...fmt(notFound, 'baked not-found pages (generateStaticParams silently dropped them)'));
    lines.push(...fmt(size, `near-empty pages (< ${MIN_HTML_BYTES} bytes)`));
    lines.push(
      ...fmt(badLang, 'pages with missing/wrong <html lang> (fixup-next-segment-paths did not run?)'),
    );
  }
  if (mode !== 'missing') {
    lines.push(...fmt(extra, 'extra route dirs (baked, but unknown to sitemap and allowlist)'));
  }

  if (lines.length > 0) {
    console.error(`❌ check-export-routes (${mode}): ${expected.length} expected, ${baked.length} baked`);
    console.error(lines.join('\n'));
    process.exit(1);
  }

  console.log(`✅ check-export-routes (${mode}): ${expected.length} expected routes, ${baked.length} baked — all present, none orphaned`);
}

if (require.main === module) {
  main();
}

module.exports = {
  sitemapLocToRelPath,
  parseSitemapRoutes,
  parseSitemapLocs,
  findBakedRoutes,
  checkExportRoutes,
  classifyBakedPage,
  NOINDEX_ROUTE_PATHS,
  NOINDEX_BAKED_PATTERNS,
  LOCALES,
  LANG_BY_LOCALE,
  MIN_HTML_BYTES,
};
