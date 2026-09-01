/**
 * Sitemap drift guard (CI).
 *
 * The sitemap is a GENERATED file: `npm run sitemap:generate` (scripts/generate-
 * sitemap.js) writes public/sitemap.xml from spots/news/static pages. It must
 * never be hand-edited — if the committed file drifts from what the generator
 * produces (a new spot not added, a hand-removed URL, a forgotten hreflang),
 * CI should fail so the author regenerates instead of patching by hand.
 *
 * Why not a plain `git diff`? The generator stamps `<lastmod>` with TODAY's
 * date (new Date().toISOString()), so a fresh regeneration always differs from
 * the committed file by lastmod alone. This check compares the URL structure
 * (loc + changefreq + priority + hreflang block) while ignoring `<lastmod>`,
 * so the guard is deterministic across days and only trips on real drift.
 *
 * Usage (CI, after `npm run sitemap:generate`):
 *   node scripts/check-sitemap-drift.js
 *
 * Exit codes:
 *   0 — generated file matches HEAD structurally (fresh or lastmod-only drift);
 *   1 — structural drift: committed sitemap differs from what the generator
 *       produces (missing/extra URLs, changed priority/changefreq, hreflang).
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SITEMAP_REL = path.join('public', 'sitemap.xml');

/** Normalize line endings + whitespace so CRLF/indent diffs don't false-positive. */
function normalize(xml) {
  return xml.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

/** Drop <lastmod> — the generator stamps today's date; lastmod is not drift. */
function stripLastmod(xml) {
  return xml.replace(/<lastmod>[^<]*<\/lastmod>/g, '');
}

function committedSitemap() {
  try {
    // Working tree = freshly generated (CI runs the generator right before).
    // HEAD = what was committed. `git show` avoids checkout churn.
    // maxBuffer: o sitemap tem ~1.2 MB — o default de 1 MB do execFileSync
    // estoura com ENOBUFS em Windows/CI.
    return execFileSync('git', ['show', `HEAD:${SITEMAP_REL.replace(/\\/g, '/')}`], {
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return null; // untracked/new file or shallow history — nothing to compare.
  }
}

function main() {
  const generatedPath = path.join(__dirname, '..', SITEMAP_REL);
  if (!fs.existsSync(generatedPath)) {
    console.log('✅ sitemap ausente — nada a verificar (o gerador cria-o).');
    process.exit(0);
  }

  const head = committedSitemap();
  if (head === null) {
    console.log('✅ public/sitemap.xml ainda não está no HEAD — nada a comparar.');
    process.exit(0);
  }

  const generated = fs.readFileSync(generatedPath, 'utf-8');
  const a = stripLastmod(normalize(generated));
  const b = stripLastmod(normalize(head));

  if (a === b) {
    console.log(
      '✅ public/sitemap.xml coincide com o gerador (só lastmod difere, o que é esperado).',
    );
    process.exit(0);
  }

  // Find the first structural difference for a useful message.
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
    arr.slice(context, context + 8).map((l) => `    ${l}`).join('\n') ||
    '    (fim do ficheiro)';

  console.error(`::error::public/sitemap.xml está DESACTUALIZADO — difere do que o gerador produz (${SITEMAP_REL}).`);
  console.error('Isto é um ficheiro gerado (scripts/generate-sitemap.js) e não deve ser editado à mão.');
  console.error('Corre `npm run sitemap:generate` e commita o resultado (novos spots/notícias/hreflang não chegaram ao ficheiro).');
  console.error('');
  console.error('Primeira diferença (gerado vs committed):');
  console.error(show(al));
  console.error('--- vs ---');
  console.error(show(bl));
  process.exit(1);
}

main();
