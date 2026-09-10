import { describe, it, expect } from 'vitest';
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

  it('drops keys removed from the build shape', () => {
    const fixture = { moledo: { waveHeight: 1.36, legacy: true } };
    const build = { moledo: { waveHeight: 1.18 } };
    expect(mergeShape(fixture, build)).toEqual({ moledo: { waveHeight: 1.36 } });
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
    expect(mergeShape(null, build)).toEqual(build);
    expect(mergeShape('nope', build)).toEqual(build);
  });
});
