/**
 * Pure helpers for the shape-gated visual-regression fixture sync.
 *
 * Extracted from scripts/sync-visual-fixture.mjs so the value-preserving merge
 * is unit-testable without executing the script (which reads out/ and writes
 * the fixture as a side effect of being imported).
 */

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const sameType = (a, b) => {
  if (a === null || b === null) return a === null && b === null;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b);
  return typeof a === typeof b;
};

/**
 * JSON structural skeleton: object keys sorted, nesting, scalar types, and the
 * element type of the first array entry. Deliberately ignores scalar values and
 * array lengths (time-series grow a row per run, and those zones are masked).
 */
export function skeleton(v) {
  if (Array.isArray(v)) {
    return { t: 'array', el: v.length ? skeleton(v[0]) : null };
  }
  if (isPlainObject(v)) {
    const out = { t: 'object' };
    for (const k of Object.keys(v).sort()) out[k] = skeleton(v[k]);
    return out;
  }
  return { t: typeof v };
}

/**
 * Merge the BUILD shape into the existing FIXTURE while preserving fixture
 * scalar VALUES wherever the build shape still matches.
 *
 * Why: when any key's shape changes anywhere in a large JSON, the old sync
 * copied the whole build file — rewriting every unrelated value. For
 * data-dependent LAYOUT (e.g. the homepage TopNow grid picks
 * `lg:grid-cols-3` vs `lg:grid-cols-4` from how many sports score ≥60) a value
 * churn flips pixels and strands every baseline recorded against the previous
 * values. Preserving fixture values on a shape change keeps the recorded
 * baselines valid and confines the diff to the actual structural change.
 *
 * Rules:
 *  - objects: union of keys; a key present in both recurses (fixture value);
 *    a key only in the build comes from the build (new shape).
 *  - arrays: keep the fixture array verbatim when both are arrays with the
 *    same element type (values + length are masked/pinned); otherwise the
 *    build array wins (new shape).
 *  - scalars/null: keep the fixture value when the type matches, else build.
 */
export function mergeShape(fixtureValue, buildValue) {
  if (isPlainObject(buildValue)) {
    if (!isPlainObject(fixtureValue)) return buildValue;
    const out = {};
    for (const k of Object.keys(buildValue)) {
      out[k] = Object.prototype.hasOwnProperty.call(fixtureValue, k)
        ? mergeShape(fixtureValue[k], buildValue[k])
        : buildValue[k];
    }
    return out;
  }
  if (Array.isArray(buildValue)) {
    if (
      Array.isArray(fixtureValue) &&
      fixtureValue.length > 0 &&
      buildValue.length > 0 &&
      sameType(fixtureValue[0], buildValue[0])
    ) {
      return fixtureValue;
    }
    return buildValue;
  }
  return fixtureValue !== undefined && sameType(fixtureValue, buildValue)
    ? fixtureValue
    : buildValue;
}
