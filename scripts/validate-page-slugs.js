/**
 * Validates the URL segments produced outside /spots/[slug]: the SEO
 * landing pages (/explorar/[slug], built from src/lib/seoLandings.ts) and
 * the sport category pages (/modalidades/[slug], src/app/[locale]/modalidades/
 * [slug]/page.tsx).
 *
 * Same bug class as the accented slug fixed in 63cffbcf5: a slug that is not
 * ASCII/URL-safe silently 404s client-side after hydration, and a duplicated
 * slug silently overwrites another route in the static export. The sport and
 * region slugs are hand-written literals spread across two files, so a typo
 * (garrão-style 'açores', or a sport added to one file but not the other)
 * would reintroduce it without any test noticing.
 *
 * Also guards the derived landings: a slug in POPULAR_LANDING_SLUGS that
 * does not match any built landing is silently dropped from the homepage
 * grid, and a SPORT_LABELS key missing for a SEO_SPORTS entry crashes the
 * build (landingTitle reads SPORT_LABELS[landing.sport]).
 *
 * Regex-based over the source text, like validate-spots.js — no transpile,
 * runs in any workflow, fails before build/E2E. The checks are a pure
 * validatePageSlugsContent(seoSource, modalSource) so the pre-commit hook
 * can validate staged blobs; the CLI is a thin wrapper.
 *
 * Usage: node scripts/validate-page-slugs.js
 *   exit 0 = all good, exit 1 = at least one problem
 */

const fs = require('fs');
const path = require('path');

const SLUG_RE = /^[a-z0-9-]+$/;

function block(content, startMark, endMark) {
  const i = content.indexOf(startMark);
  const j = content.indexOf(endMark, i >= 0 ? i : 0);
  return i >= 0 && j > i ? content.slice(i, j) : '';
}

function quotedItems(content) {
  return [...content.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Each entry in an object block: `  Norte: 'norte',` or `  'Açores': 'acores',` */
function objValues(content) {
  return [...content.matchAll(/^\s+(?:'.*?'|[^,{}:]+):\s*'([^']+)'/gm)].map((m) => m[1]);
}

/** Each entry in an array block: `  'surf',` … */
function arrayItems(content) {
  return [...content.matchAll(/^\s*'([^']+)'/gm)].map((m) => m[1]);
}

const checkAscii = (errors, label, list, sourceLabel) => {
  for (const s of list) {
    if (!SLUG_RE.test(s)) {
      errors.push(
        `${sourceLabel}: ${label} "${s}" is not ASCII/URL-safe. It becomes a URL segment; ` +
        `accented slugs cause a silent 404 client-side after hydration (see commit 63cffbcf5) — ` +
        `use the unaccented form (ex.: Açores → acores).`
      );
    }
  }
};

const checkUnique = (errors, label, list, sourceLabel) => {
  const seen = new Map();
  for (const s of list) {
    if (seen.has(s)) {
      errors.push(`${sourceLabel}: duplicate ${label} "${s}" — two entries generate the same route and one page silently overwrites the other.`);
    } else {
      seen.set(s, true);
    }
  }
};

/**
 * Validates the source text of the two files that produce the
 * /explorar/[slug] and /modalidades/[slug] URL segments.
 * @param {string} seo  content of src/lib/seoLandings.ts
 * @param {string} modal  content of src/app/[locale]/modalidades/[slug]/page.tsx
 * @returns {{ errors: string[], sportCount: number, regionSlugCount: number, derivedCount: number }}
 */
function validatePageSlugsContent(seo, modal) {
  const errors = [];

  // --- src/lib/seoLandings.ts -------------------------------------------------

  const regionSlugsBlock = block(seo, 'const REGION_SLUGS', 'const SLUG_TO_REGION');
  const regionSlugs = objValues(regionSlugsBlock);

  // The closing bracket sits alone on its line — `GridSportFilter[]` in the
  // type annotation has its own `]`, so stop at a line-start bracket.
  const sportsBlock = block(seo, 'const SEO_SPORTS', '\n]');
  const sports = arrayItems(sportsBlock);

  const labelsBlock = block(seo, 'const SPORT_LABELS', 'const REGION_LABELS');
  const labelSlugs = [...labelsBlock.matchAll(/^\s*'?([a-z][a-z-]*)'?\s*:\s*\{/gm)].map((m) => m[1]);

  const popularBlock = block(seo, 'const POPULAR_LANDING_SLUGS', '] as const');
  const popular = arrayItems(popularBlock).concat(quotedItems(popularBlock)).filter(Boolean);

  // --- src/app/[locale]/modalidades/[slug]/page.tsx ----------------------------

  const validBlock = block(modal, 'const VALID_SLUGS', '\n');
  const validSlugs = quotedItems(validBlock);

  // --- checks -----------------------------------------------------------------

  checkAscii(errors, 'region slug', regionSlugs, 'seoLandings.ts REGION_SLUGS');
  checkUnique(errors, 'region slug', regionSlugs, 'seoLandings.ts REGION_SLUGS');

  checkAscii(errors, 'sport slug', sports, 'seoLandings.ts SEO_SPORTS');
  checkUnique(errors, 'sport slug', sports, 'seoLandings.ts SEO_SPORTS');

  for (const sport of sports) {
    if (!labelSlugs.includes(sport)) {
      errors.push(
        `seoLandings.ts SPORT_LABELS: missing key "${sport}" — landingTitle() reads SPORT_LABELS[landing.sport] and crashes the build for the "${sport}" landing.`
      );
    }
  }

  // Derived landing slugs: every sport alone, plus every sport-region combo.
  const composed = [];
  for (const sport of sports) {
    composed.push(sport);
    for (const regionSlug of regionSlugs) {
      composed.push(`${sport}-${regionSlug}`);
    }
  }
  checkUnique(errors, 'derived landing slug', composed, 'seoLandings.ts (sport + sport-region combos)');

  for (const slug of popular) {
    const [sport, ...rest] = slug.split('-');
    const regionPart = rest.join('-');
    const known = sports.includes(slug) || (sports.includes(sport) && regionSlugs.includes(regionPart));
    if (!known) {
      errors.push(
        `seoLandings.ts POPULAR_LANDING_SLUGS: "${slug}" matches no built landing — ` +
        `getPopularLandings() silently drops it from the homepage grid.`
      );
    }
  }

  checkAscii(errors, 'modality slug', validSlugs, 'modalidades/[slug]/page.tsx VALID_SLUGS');
  checkUnique(errors, 'modality slug', validSlugs, 'modalidades/[slug]/page.tsx VALID_SLUGS');

  for (const slug of validSlugs) {
    if (!sports.includes(slug)) {
      errors.push(`modalidades/[slug]/page.tsx VALID_SLUGS: "${slug}" is not in seoLandings.ts SEO_SPORTS — /modalidades/${slug}/ links would 404.`);
    }
  }
  for (const slug of sports) {
    if (!validSlugs.includes(slug)) {
      errors.push(`seoLandings.ts SEO_SPORTS: "${slug}" is missing from modalidades/[slug]/page.tsx VALID_SLUGS — its /modalidades/${slug}/ page would 404.`);
    }
  }

  return {
    errors,
    sportCount: sports.length,
    regionSlugCount: regionSlugs.length,
    derivedCount: composed.length,
  };
}

function main() {
  const seoPath = path.join(__dirname, '../src/lib/seoLandings.ts');
  const modalPath = path.join(__dirname, '../src/app/[locale]/modalidades/[slug]/page.tsx');
  const { errors, sportCount, regionSlugCount, derivedCount } = validatePageSlugsContent(
    fs.readFileSync(seoPath, 'utf8'),
    fs.readFileSync(modalPath, 'utf8'),
  );

  if (errors.length > 0) {
    console.error(`❌ validate-page-slugs: ${errors.length} issue(s)\n`);
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log(`✅ validate-page-slugs: ${sportCount} sport slugs, ${regionSlugCount} region slugs, ${derivedCount} derived landings — ASCII-safe and unique; popular slugs and modality pages in sync`);
}

module.exports = { validatePageSlugsContent };

if (require.main === module) main();
