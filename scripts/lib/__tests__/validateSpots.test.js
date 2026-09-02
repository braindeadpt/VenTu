/**
 * Unit tests for scripts/validate-spots.js slug guards.
 *
 * Requires the real module (guarded CLI — no execution on require). Feeds
 * malformed spot fixtures straight to the pure validateSpotsContent() and
 * asserts each guard raises its error: accented slug (bug class 63cffbcf5),
 * duplicate slug, missing compatibleSports. Also asserts the id may keep
 * accents — it is a data key, never a URL.
 */

import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { validateSpotsContent } = require('../../validate-spots.js');

/** One well-formed spot — every fixture starts from this shape. */
function spot(id, slug) {
  return `    {\n      id: '${id}', slug: '${slug}', name: 'X',\n      compatibleSports: ['surf'],\n    },`;
}

/** Wrap spot blocks like the real file: the parser needs the closing `];`. */
function fixture(...blocks) {
  return blocks.join('\n') + '\n];';
}

describe('validate-spots — slug integrity guards', () => {
  it('passes well-formed ASCII slugs with no errors', () => {
    const source = fixture(spot('praia-a', 'praia-a'), spot('praia-b', 'praia-b'));
    const { errors, spotCount } = validateSpotsContent(source);
    expect(errors).toEqual([]);
    expect(spotCount).toBe(2);
  });

  it('rejects an accented slug with the ASCII/URL-safe message', () => {
    const { errors } = validateSpotsContent(fixture(spot('garrão', 'garrão')));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/slug "garrão" is not ASCII\/URL-safe/);
    expect(errors[0]).toMatch(/63cffbcf5/);
    expect(errors[0]).toMatch(/garrão → garrao/);
  });

  it('allows an accented id as long as the slug is ASCII (id is a data key, never a URL)', () => {
    const { errors } = validateSpotsContent(fixture(spot('garrão', 'garrao')));
    expect(errors).toEqual([]);
  });

  it('rejects two spots sharing a slug, naming both ids', () => {
    const { errors } = validateSpotsContent(
      fixture(spot('a-1', 'mesma-praia'), spot('a-2', 'mesma-praia')),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^Duplicate slug "mesma-praia": spots "a-1" and "a-2"/);
  });

  it('still flags a spot missing compatibleSports', () => {
    const broken =
      `    {\n` +
      `      id: 'praia-c', slug: 'praia-c', name: 'X',\n` +
      `      type: 'surf',\n` +
      `    },\n];`;
    const { errors } = validateSpotsContent(broken);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/missing compatibleSports/);
  });
});
