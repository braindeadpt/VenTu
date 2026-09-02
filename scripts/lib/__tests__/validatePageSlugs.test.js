/**
 * Unit tests for scripts/validate-page-slugs.js guards.
 *
 * Requires the real module (guarded CLI — no execution on require). Feeds
 * malformed fixtures of the two source files straight to the pure
 * validatePageSlugsContent(seo, modal) and asserts each guard raises its
 * error: accented region slug (bug class 63cffbcf5), duplicate region slug
 * (with derived-landing collisions), popular-slug typo silently dropped from
 * the homepage grid, and sport/modality drift between the two files.
 */

import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { validatePageSlugsContent } = require('../../validate-page-slugs.js');

/**
 * Minimal src/lib/seoLandings.ts-shaped source. Every named block the parser
 * anchors on is present; optional overrides mutate one concern at a time.
 */
function seoSource({
  sports = ['surf', 'kitesurf', 'windsurf'],
  regionSlugs = { Norte: 'norte', Algarve: 'algarve' },
  labels = ['surf', 'kitesurf', 'windsurf'],
  popular = ['surf', 'surf-algarve'],
} = {}) {
  const regionEntries = Object.entries(regionSlugs)
    .map(([region, slug]) => `  ${region}: '${slug}',`)
    .join('\n');
  return [
    `const SEO_SPORTS: GridSportFilter[] = [`,
    ...sports.map((s) => `  '${s}',`),
    `]`,
    ``,
    `const REGION_SLUGS: Record<Exclude<MacroRegion, 'Todos'>, string> = {`,
    regionEntries,
    `}`,
    ``,
    `const SLUG_TO_REGION = Object.fromEntries(Object.entries(REGION_SLUGS))`,
    ``,
    `const SPORT_LABELS: Record<string, { pt: string; en: string }> = {`,
    ...labels.map((l) => `  ${l}: { pt: 'X', en: 'X' },`),
    `}`,
    ``,
    `const REGION_LABELS: Record<MacroRegion, { pt: string; en: string }> = { Todos: { pt: 'Portugal', en: 'Portugal' } }`,
    ``,
    `const POPULAR_LANDING_SLUGS = [`,
    ...popular.map((p) => `  '${p}',`),
    `] as const`,
  ].join('\n');
}

/** Minimal modalidades page source: the VALID_SLUGS literal on one line. */
function modalSource(slugs = ['surf', 'kitesurf', 'windsurf']) {
  return `const VALID_SLUGS = ['${slugs.join("', '")}']\n`;
}

describe('validate-page-slugs — URL-segment guards', () => {
  it('passes ASCII-safe, in-sync sources with no errors', () => {
    const { errors, sportCount, regionSlugCount, derivedCount } = validatePageSlugsContent(
      seoSource(),
      modalSource(),
    );
    expect(errors).toEqual([]);
    expect(sportCount).toBe(3);
    expect(regionSlugCount).toBe(2);
    expect(derivedCount).toBe(3 + 3 * 2); // sports + sport-region combos
  });

  it('rejects an accented region slug with the ASCII/URL-safe message', () => {
    const { errors } = validatePageSlugsContent(
      seoSource({ regionSlugs: { Norte: 'norte', Algarve: 'algarve', 'Açores': 'açores' } }),
      modalSource(),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/REGION_SLUGS: region slug "açores" is not ASCII\/URL-safe/);
    expect(errors[0]).toMatch(/63cffbcf5/);
    expect(errors[0]).toMatch(/Açores → acores/);
  });

  it('rejects duplicate region slugs and the derived landing collisions they cause', () => {
    const { errors } = validatePageSlugsContent(
      seoSource({ regionSlugs: { Norte: 'norte', Centro: 'norte' } }),
      modalSource(),
    );
    expect(errors.some((e) => e.includes('duplicate region slug "norte"'))).toBe(true);
    expect(errors.some((e) => e.includes('duplicate derived landing slug "surf-norte"'))).toBe(true);
  });

  it('rejects a popular-slug typo that getPopularLandings() would silently drop', () => {
    const { errors } = validatePageSlugsContent(
      seoSource({ popular: ['surf-algarv'] }),
      modalSource(),
    );
    expect(errors.some((e) => e.includes('POPULAR_LANDING_SLUGS: "surf-algarv" matches no built landing'))).toBe(true);
  });

  it('rejects a sport with no SPORT_LABELS key (landingTitle would crash the build)', () => {
    const { errors } = validatePageSlugsContent(
      seoSource({ labels: ['surf', 'kitesurf'] }),
      modalSource(),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/SPORT_LABELS: missing key "windsurf"/);
  });

  it('flags a modality slug that is not a known SEO sport (/modalidades/x/ would 404)', () => {
    const { errors } = validatePageSlugsContent(
      seoSource(),
      modalSource(['surf', 'kitesurf', 'windsurf', 'foil']),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/VALID_SLUGS: "foil" is not in seoLandings.ts SEO_SPORTS/);
  });

  it('flags an SEO sport missing from the modalidades page (/modalidades/x/ would 404)', () => {
    const { errors } = validatePageSlugsContent(
      seoSource(),
      modalSource(['surf', 'kitesurf']),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/SEO_SPORTS: "windsurf" is missing from modalidades\/\[slug\]\/page\.tsx VALID_SLUGS/);
  });
});
