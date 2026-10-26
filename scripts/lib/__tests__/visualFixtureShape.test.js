import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mergeShape, skeleton } from '../visualFixtureShape.mjs';

describe('skeleton', () => {
  it('captures keys/types and ignores scalar values and array length', () => {
    const a = skeleton({ x: 1, y: { z: 'a' }, list: [1, 2, 3] });
    const b = skeleton({ x: 999, y: { z: 'zzz' }, list: [42] });
    expect(a).toEqual(b);
  });

  it('changes when an object key is added', () => {
    expect(skeleton({ x: 1 })).not.toEqual(skeleton({ x: 1, y: 2 }));
  });

  it('changes when a scalar type changes', () => {
    expect(skeleton({ x: 1 })).not.toEqual(skeleton({ x: '1' }));
  });
});

describe('mergeShape', () => {
  it('keeps the fixture scalar values when the shape matches', () => {
    const fixture = { moledo: { waveHeight: 1.36, period: 7 } };
    const build = { moledo: { waveHeight: 1.18, period: 9 } };
    expect(mergeShape(fixture, build)).toEqual(fixture);
  });

  it('adopts a new build key without disturbing existing values', () => {
    const fixture = { moledo: { waveHeight: 1.36 } };
    const build = { moledo: { waveHeight: 1.18, observedWave: { height: 2 } } };
    expect(mergeShape(fixture, build)).toEqual({
      moledo: { waveHeight: 1.36, observedWave: { height: 2 } },
    });
  });

  it('keeps fixture-only keys the live build does not publish yet (notaV6, #218 PR 3)', () => {
    const notaV6 = { t: '2026-09-08T08:00:00Z', kite: 41, surf: 67 };
    const fixture = { moledo: { waveHeight: 1.36, notaV6 } };
    const build = { moledo: { waveHeight: 1.18, tideStation: 'leixoes' } };
    const merged = mergeShape(fixture, build);
    expect(merged).toEqual({ moledo: { waveHeight: 1.36, notaV6, tideStation: 'leixoes' } });
    // fixture key order first, build-only keys appended → no re-order churn
    expect(Object.keys(merged.moledo)).toEqual(['waveHeight', 'notaV6', 'tideStation']);
  });

  it('keeps a fixture value when either side is null (nullable value, not shape)', () => {
    expect(mergeShape({ deg: null }, { deg: 22 })).toEqual({ deg: null });
    expect(mergeShape({ deg: 22 }, { deg: null })).toEqual({ deg: 22 });
    expect(mergeShape({ a: { state: 'x' } }, { a: null })).toEqual({ a: { state: 'x' } });
    expect(mergeShape({ a: null }, { a: { state: 'x' } })).toEqual({ a: null });
  });

  it('keeps the fixture array when its first element flips null↔number (map-hours scores)', () => {
    const fixture = { kitesurf: [null, 12, 30] };
    const build = { kitesurf: [0, null, null, 4] };
    expect(mergeShape(fixture, build)).toEqual(fixture);
    expect(mergeShape({ s: [7, null] }, { s: [null, 3] })).toEqual({ s: [7, null] });
  });

  it('preserves the fixture array values and length when element type matches', () => {
    const fixture = { refs: [{ ref: 'old', nDays: 3 }] };
    const build = { refs: [{ ref: 'new', nDays: 9 }, { ref: 'extra', nDays: 1 }] };
    expect(mergeShape(fixture, build)).toEqual(fixture);
  });

  it('uses the build array when the element shape changes', () => {
    const fixture = { refs: [1, 2] };
    const build = { refs: [{ ref: 'new' }] };
    expect(mergeShape(fixture, build)).toEqual(build);
  });

  it('takes the build value on a scalar type change', () => {
    const fixture = { x: 1 };
    const build = { x: 'one' };
    expect(mergeShape(fixture, build)).toEqual({ x: 'one' });
  });

  it('takes the build value when the fixture is not an object', () => {
    const build = { a: 1 };
    expect(mergeShape('nope', build)).toEqual(build);
    expect(mergeShape(undefined, build)).toEqual(build);
  });
});

describe('sync-visual-fixture.mjs (end to end on a temp tree)', () => {
  const SCRIPT = resolve(__dirname, '../../sync-visual-fixture.mjs');
  const put = (root, rel, text) => {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), text);
  };

  it('keeps fixture-only keys and files, and does not rewrite a value-only file', () => {
    const root = mkdtempSync(join(tmpdir(), 'vfix-'));
    try {
      const fix = 'tests/e2e/fixtures/data';
      // conditions: fixture has notaV6, live has a new key and a null flip
      put(root, `${fix}/conditions.json`, `${JSON.stringify({ moledo: { wave: 1.3, deg: 20, notaV6: { kite: 41, surf: 67 } } }, null, 2)}\n`);
      put(root, 'out/data/conditions.json', JSON.stringify({ moledo: { wave: 9, deg: null, tideStation: 'leixoes' } }));
      // map-hours: only a null↔number flip → merges back to the same fixture → untouched bytes
      const mh = '{"spots":{"moledo":{"surf":[null,12]}}}';
      put(root, `${fix}/map-hours.json`, mh);
      put(root, 'out/data/map-hours.json', JSON.stringify({ spots: { moledo: { surf: [0, null] } } }));
      // aggregate that the live data no longer publishes but unit tests read
      put(root, `${fix}/forecasts.json`, '{"moledo":[{"time":"x"}]}');

      const log = execFileSync(process.execPath, [SCRIPT], { cwd: root, encoding: 'utf8' });

      const cond = JSON.parse(readFileSync(join(root, fix, 'conditions.json'), 'utf8'));
      expect(cond).toEqual({ moledo: { wave: 1.3, deg: 20, notaV6: { kite: 41, surf: 67 }, tideStation: 'leixoes' } });
      expect(readFileSync(join(root, fix, 'map-hours.json'), 'utf8')).toBe(mh);
      expect(existsSync(join(root, fix, 'forecasts.json'))).toBe(true);
      expect(log).toContain('1 merged');
      expect(log).toContain('1 fixture-only kept (forecasts.json)');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
