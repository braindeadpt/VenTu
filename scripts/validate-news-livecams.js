/**
 * Validates the remaining data-derived URL-segment surfaces:
 *
 * 1. News slugs (/news/[slug]): derived at build time from public/data/
 *    news.json as `slugify(title)-<id suffix>` — duplicated verbatim in
 *    src/lib/news.ts (route) and scripts/generate-sitemap.js (sitemap). A
 *    title collision that yields the same slug as another item makes two
 *    articles share one route in the static export (silent overwrite), and
 *    a slug with non-ASCII or empty base would break the URL — same bug
 *    class as the accented spot slug fixed in 63cffbcf5.
 *
 * 2. Livecam keys (src/lib/spotLivecams.ts): keys that match a spot slug
 *    surface as `/spots/<slug>/` links on /livecams/ (the page resolves
 *    them with spots.find and only links when the spot exists). Standalone
 *    regional cams are allowed, but only via the explicit
 *    STANDALONE_LIVECAM_KEYS allowlist: sem ela um slug mal escrito ficava
 *    para sempre tratado como «cam regional» e invisível (auditoria M7). A
 *    duplicate or non-ASCII key silently loses or hides a cam forever.
 *
 * Regex/data-based over the inputs, no transpile — same pattern as
 * validate-spots.js / validate-page-slugs.js. The news derivation mirrors
 * the two production copies exactly; keep all three in sync.
 *
 * Usage: node scripts/validate-news-livecams.js
 *   exit 0 = all good, exit 1 = at least one problem
 */

const fs = require('fs');
const path = require('path');

const SLUG_RE = /^[a-z0-9-]+$/;

/**
 * Cams regionais sem spot correspondente — intencionais, revistas à mão.
 * Qualquer outra key tem de existir em src/lib/spots.ts; keys do
 * spotLivecams.ts fora de ambas as listas são tratadas como typo (M7).
 */
const STANDALONE_LIVECAM_KEYS = new Set(['peniche']);

/**
 * Mirrors src/lib/news.ts slugify() and scripts/generate-sitemap.js.
 * All three copies must stay identical.
 */
function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** Mirrors src/lib/news.ts newsSlug(): slugified title + last-6 of the id. */
function newsSlug(item) {
  const base = slugify(item.title);
  const hash = String(item.id || '').slice(-6);
  return `${base}-${hash}`;
}

/** @param {unknown[]} newsItems parsed public/data/news.json items */
function validateNewsSlugs(newsItems) {
  const errors = [];
  const seen = new Map();
  for (const item of newsItems) {
    const slug = newsSlug(item);
    const base = slugify(item.title);
    const idLabel = item && item.id ? String(item.id) : '(missing id)';
    if (!base) {
      errors.push(`news.json item "${idLabel}": title slugifies to an empty base — its /news/ route would be invalid.`);
      continue;
    }
    if (!SLUG_RE.test(slug)) {
      errors.push(`news.json item "${idLabel}": derived slug "${slug}" is not ASCII/URL-safe — see commit 63cffbcf5 for why that class of slug breaks the static export.`);
      continue;
    }
    if (seen.has(slug)) {
      errors.push(`news.json: duplicate derived slug "${slug}" — items "${seen.get(slug)}" and "${idLabel}" would share one /news/ route.`);
    } else {
      seen.set(slug, idLabel);
    }
  }
  return errors;
}

/** Matches every 2-space-indented map key: quoted ('mole-dó':) or a bare
 * slug key (moledo:). Only these two shapes — never a `},` closer or a
 * property line — so non-ASCII keys are captured and can be flagged. */
const LIVECAM_KEY_RE = /^ {2}(?:'([^']+)'|([a-z0-9-]+)): \{/gm;

/** @param {string} livecamsSource content of src/lib/spotLivecams.ts
 *  @param {Set<string> | null} [spotSlugs] slugs de src/lib/spots.ts — quando
 *  dado, cada key tem de pertencer aos slugs ou à allowlist standalone. */
function validateLivecamKeys(livecamsSource, spotSlugs = null) {
  const errors = [];
  const seen = new Map();
  const keys = [...livecamsSource.matchAll(LIVECAM_KEY_RE)].map((m) => m[1] ?? m[2]);
  for (const key of keys) {
    if (!SLUG_RE.test(key)) {
      errors.push(`spotLivecams.ts: livecam key "${key}" is not ASCII/URL-safe — it can never match a spot slug, so the cam is unreachable from any spot page.`);
      continue;
    }
    if (seen.has(key)) {
      errors.push(`spotLivecams.ts: duplicate livecam key "${key}" — the second entry silently overwrites the first.`);
    } else {
      seen.set(key, true);
    }
    if (spotSlugs && !spotSlugs.has(key) && !STANDALONE_LIVECAM_KEYS.has(key)) {
      errors.push(`spotLivecams.ts: livecam key "${key}" não corresponde a nenhum slug de spots.ts nem está em STANDALONE_LIVECAM_KEYS — provável typo: a cam fica inalcançável em qualquer página de spot.`);
    }
  }
  return errors;
}

/**
 * Pure entry point used by both the CLI and the pre-commit hook.
 * @param {{ newsItems: unknown[], livecamsSource: string }} inputs
 * @returns {{ errors: string[], newsCount: number, livecamCount: number }}
 */
function validateNewsLivecamsContent({ newsItems, livecamsSource, spotSlugs = null }) {
  const errors = [
    ...validateNewsSlugs(newsItems),
    ...validateLivecamKeys(livecamsSource, spotSlugs),
  ];
  const livecamCount = [...livecamsSource.matchAll(LIVECAM_KEY_RE)].length;
  return { errors, newsCount: newsItems.length, livecamCount };
}

function main() {
  const dataRoot = path.join(__dirname, '..', 'public', 'data');
  const newsPath = path.join(dataRoot, 'news.json');
  const livecamsPath = path.join(__dirname, '..', 'src', 'lib', 'spotLivecams.ts');

  const newsItems = fs.existsSync(newsPath)
    ? JSON.parse(fs.readFileSync(newsPath, 'utf8'))
    : [];
  const livecamsSource = fs.readFileSync(livecamsPath, 'utf8');
  const spotsPath = path.join(__dirname, '..', 'src', 'lib', 'spots.ts');
  const spotSlugs = new Set(
    [...fs.readFileSync(spotsPath, 'utf8').matchAll(/\bslug: '([a-z0-9-]+)'/g)].map((m) => m[1]),
  );

  const { errors, newsCount, livecamCount } = validateNewsLivecamsContent({
    newsItems,
    livecamsSource,
    spotSlugs,
  });

  if (errors.length > 0) {
    console.error(`❌ validate-news-livecams: ${errors.length} issue(s)\n`);
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log(`✅ validate-news-livecams: ${newsCount} news slugs and ${livecamCount} livecam keys — ASCII-safe and unique`);
}

module.exports = { validateNewsLivecamsContent, validateNewsSlugs, validateLivecamKeys, slugify, newsSlug };

if (require.main === module) main();
