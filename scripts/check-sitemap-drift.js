/**
 * Sitemap drift guard (CI).
 *
 * The sitemap is GENERATED: `npm run sitemap:generate` writes
 * public/sitemap.xml (index) + public/sitemap-*.xml children from
 * spots/news/static pages. Never hand-edit — if committed files drift from
 * what the generator produces, CI fails so the author regenerates.
 *
 * Why not a plain `git diff`? The generator stamps `<lastmod>` with TODAY's
 * date, so a fresh regeneration always differs from the committed files by
 * lastmod alone. This check compares structure (loc + changefreq + priority +
 * hreflang / sitemap index locs) while ignoring `<lastmod>`.
 *
 * Usage (CI, after `npm run sitemap:generate`):
 *   node scripts/check-sitemap-drift.js
 *
 * Exit codes:
 *   0 — generated files match HEAD structurally (fresh or lastmod-only drift);
 *   1 — structural drift on any sitemap file.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { SITEMAP_PARTS } = require('./generate-sitemap.js');

const PUBLIC_DIR = 'public';
const SITEMAP_FILES = ['sitemap.xml', ...SITEMAP_PARTS];

/** Normalize line endings + whitespace so CRLF/indent diffs don't false-positive. */
function normalize(xml) {
  return xml.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

/** Drop <lastmod> — the generator stamps today's date; lastmod is not drift. */
function stripLastmod(xml) {
  return xml.replace(/<lastmod>[^<]*<\/lastmod>/g, '');
}

function committedFile(relPath) {
  try {
    // Working tree = freshly generated (CI runs the generator right before).
    // HEAD = what was committed. `git show` avoids checkout churn.
    // maxBuffer: child sitemaps can still be large; default 1 MB can ENOBUFS.
    return execFileSync('git', ['show', `HEAD:${relPath.replace(/\\/g, '/')}`], {
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return null; // untracked/new file or shallow history — nothing to compare.
  }
}

function firstDiffContext(a, b) {
  const al = a.split('\n');
  const bl = b.split('\n');
  let first = -1;
  for (let i = 0; i < Math.max(al.length, bl.length); i++) {
    if (al[i] !== bl[i]) {
      first = i;
      break;
    }
  }
  const context = Math.max(0, (first === -1 ? 0 : first) - 2);
  const show = (arr) =>
    arr.slice(context, context + 8).map((l) => `    ${l}`).join('\n') || '    (fim do ficheiro)';
  return { showA: show(al), showB: show(bl) };
}

function checkOne(relPath) {
  const generatedPath = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(generatedPath)) {
    return { status: 'missing-generated', relPath };
  }

  const head = committedFile(relPath);
  if (head === null) {
    return { status: 'untracked', relPath };
  }

  const generated = fs.readFileSync(generatedPath, 'utf-8');
  const a = stripLastmod(normalize(generated));
  const b = stripLastmod(normalize(head));

  if (a === b) {
    return { status: 'ok', relPath };
  }

  const { showA, showB } = firstDiffContext(a, b);
  return { status: 'drift', relPath, showA, showB };
}

function main() {
  const results = SITEMAP_FILES.map((file) => checkOne(path.join(PUBLIC_DIR, file)));

  const missing = results.filter((r) => r.status === 'missing-generated');
  if (missing.length === SITEMAP_FILES.length) {
    console.log('✅ sitemaps ausentes — nada a verificar (o gerador cria-os).');
    process.exit(0);
  }

  for (const r of missing) {
    console.error(`::error::${r.relPath} em falta após sitemap:generate.`);
  }

  const drifts = results.filter((r) => r.status === 'drift');
  for (const r of drifts) {
    console.error(`::error::${r.relPath} está DESACTUALIZADO — difere do que o gerador produz.`);
    console.error('Isto é um ficheiro gerado (scripts/generate-sitemap.js) e não deve ser editado à mão.');
    console.error('Corre `npm run sitemap:generate` e commita o resultado (index + splits).');
    console.error('');
    console.error(`Primeira diferença em ${r.relPath} (gerado vs committed):`);
    console.error(r.showA);
    console.error('--- vs ---');
    console.error(r.showB);
  }

  if (missing.length || drifts.length) {
    process.exit(1);
  }

  const untracked = results.filter((r) => r.status === 'untracked');
  if (untracked.length === results.length) {
    console.log('✅ sitemaps ainda não estão no HEAD — nada a comparar.');
    process.exit(0);
  }

  console.log(
    `✅ ${results.filter((r) => r.status === 'ok').length}/${SITEMAP_FILES.length} sitemaps coincidem com o gerador (só lastmod difere, o que é esperado).`,
  );
  process.exit(0);
}

module.exports = { SITEMAP_FILES, normalize, stripLastmod, checkOne };

if (require.main === module) {
  main();
}
