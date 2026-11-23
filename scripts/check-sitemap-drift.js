/**
 * Sitemap drift guard (CI).
 *
 * The sitemap is a GENERATED file: `npm run sitemap:generate` (scripts/generate-
 * sitemap.js) writes public/sitemap.xml from spots/news/directory data. It must
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
 * Two modes — the data inputs decide which runs:
 *
 *  * Default (code CI): fully versioned comparison. The data jobs hydrate
 *    `public/data` from the orphan `ventu-data` branch before this step, so the
 *    working-tree news/directory files are a moving target — a committed
 *    sitemap can never match "generated from live data" for long. The guard
 *    therefore materializes the inputs with `git show HEAD:` (spots.ts,
 *    news.json, directory.json), runs the generator against that snapshot
 *    (SITEMAP_* env overrides) and compares with `git show HEAD:public/
 *    sitemap.xml`. HEAD inputs vs HEAD artifact: deterministic, identical
 *    locally and in CI, hydration-proof.
 *
 *  * SITEMAP_DRIFT_REF=<ref> (data bots, push-data-update.sh): compares the
 *    working-tree sitemap (just generated over the bot's fresh data) with the
 *    sitemap committed at <ref>. "Only lastmod drift" lets the bot keep the
 *    ref's version instead of adding churn commits. Unchanged semantics.
 *
 * Usage (CI): `node scripts/check-sitemap-drift.js`
 * Exit codes: 0 — match (fresh or lastmod-only); 1 — structural drift.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SITEMAP_REL = path.join('public', 'sitemap.xml');
const REF = process.env.SITEMAP_DRIFT_REF || 'HEAD';
const GENERATOR = path.join(__dirname, 'generate-sitemap.js');

/** Normalize line endings + whitespace so CRLF/indent diffs don't false-positive. */
function normalize(xml) {
  return xml.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

/** Drop <lastmod> — the generator stamps today's date; lastmod is not drift. */
function stripLastmod(xml) {
  return xml.replace(/<lastmod>[^<]*<\/lastmod>/g, '');
}

/** `git show <ref>:<file>` — null when the path does not exist at <ref>. */
function showFile(ref, rel) {
  try {
    return execFileSync('git', ['show', `${ref}:${rel.replace(/\\/g, '/')}`], {
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

function committedSitemap(ref) {
  // SITEMAP_DRIFT_REF: os bots de dados comparam contra a versão na branch
  // ventu-data — o HEAD do checkout deles é código, não o sitemap de dados.
  return showFile(ref, SITEMAP_REL);
}

/**
 * Generates the sitemap from the versioned snapshot at <ref>: materializes the
 * generator's inputs into a temp dir and runs it with SITEMAP_* overrides.
 * Missing data inputs materialize as empty files — the generator then treats
 * them like an absent file (zero entries), keeping the comparison honest for
 * refs that predate a data file.
 */
function generatedFromRef(ref) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitemap-drift-'));
  const inputs = {
    SITEMAP_SPOTS_TS: 'src/lib/spots.ts',
    SITEMAP_NEWS_JSON: 'public/data/news.json',
    SITEMAP_DIRECTORY_JSON: 'public/data/directory.json',
  };
  const env = { ...process.env, SITEMAP_OUT: path.join(dir, 'sitemap.xml') };
  for (const [key, rel] of Object.entries(inputs)) {
    const content = showFile(ref, rel) ?? '';
    const p = path.join(dir, rel.replace(/\//g, '_'));
    fs.writeFileSync(p, content);
    env[key] = p;
  }
  execFileSync('node', [GENERATOR], { env, stdio: 'ignore' });
  return fs.readFileSync(env.SITEMAP_OUT, 'utf-8');
}

function main() {
  const generatedPath = path.join(__dirname, '..', SITEMAP_REL);
  const refMode = Boolean(process.env.SITEMAP_DRIFT_REF);
  let generated;

  // Modo bots (SITEMAP_DRIFT_REF): compara a sitemap da working tree (gerada
  // sobre os dados frescos do bot) com a versão no ref — semântica original.
  if (refMode) {
    if (!fs.existsSync(generatedPath)) {
      console.log('✅ sitemap ausente — nada a verificar (o gerador cria-o).');
      process.exit(0);
    }
    generated = fs.readFileSync(generatedPath, 'utf-8');
  } else {
    // Modo versionado (CI de código): gera a partir do HEAD e compara com o
    // ficheiro do HEAD — a working tree hidratada não entra na equação.
    const head = committedSitemap('HEAD');
    if (head === null) {
      console.log('✅ public/sitemap.xml ainda não está no HEAD — nada a comparar.');
      process.exit(0);
    }
    try {
      generated = generatedFromRef('HEAD');
    } catch (err) {
      console.error(`::error::o gerador falhou sobre o snapshot do HEAD: ${err.message}`);
      process.exit(1);
    }
  }

  const head = committedSitemap(REF);
  if (head === null) {
    console.log(`✅ public/sitemap.xml não existe em ${REF} — nada a comparar.`);
    process.exit(0);
  }

  const a = stripLastmod(normalize(generated));
  const b = stripLastmod(normalize(head));

  if (a === b) {
    console.log(
      `✅ public/sitemap.xml coincide com o gerador em ${REF} (só lastmod difere, o que é esperado).`,
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

  console.error(`::error::public/sitemap.xml está DESACTUALIZADO — difere do que o gerador produz em ${REF} (${SITEMAP_REL}).`);
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
