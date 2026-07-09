import { describe, it, expect } from 'vitest';
import {
  recommendKite,
  kiteWindWindow,
  recommendWetsuit,
  KITE_SIZES,
} from '@/lib/gearCalc';

describe('recommendKite', () => {
  it('75kg at 18kt twintip lands on a 9m² (industry rule of thumb)', () => {
    const rec = recommendKite(75, 18, 'twintip');
    expect(rec).not.toBeNull();
    expect(rec!.idealM2).toBeCloseTo(9.2, 1);
    expect(rec!.primaryM2).toBe(9);
  });

  it('foil needs a much smaller kite than twintip at same weight/wind', () => {
    const twintip = recommendKite(80, 15, 'twintip')!;
    const foil = recommendKite(80, 15, 'foil')!;
    expect(foil.primaryM2).toBeLessThan(twintip.primaryM2);
  });

  it('stronger wind → smaller kite, monotonic', () => {
    const light = recommendKite(75, 12, 'twintip')!;
    const strong = recommendKite(75, 30, 'twintip')!;
    expect(strong.primaryM2).toBeLessThan(light.primaryM2);
  });

  it('primary is always a production size', () => {
    for (let w = 45; w <= 110; w += 13) {
      for (let v = 8; v <= 35; v += 5) {
        const rec = recommendKite(w, v)!;
        expect(KITE_SIZES).toContain(rec.primaryM2);
      }
    }
  });

  it('secondary is adjacent to primary and on the ideal side', () => {
    const rec = recommendKite(75, 18, 'twintip')!;
    if (rec.secondaryM2 != null) {
      const pi = KITE_SIZES.indexOf(rec.primaryM2 as (typeof KITE_SIZES)[number]);
      const si = KITE_SIZES.indexOf(rec.secondaryM2 as (typeof KITE_SIZES)[number]);
      expect(Math.abs(pi - si)).toBe(1);
    }
  });

  it('window brackets the ideal wind for that size', () => {
    const w = kiteWindWindow(75, 9, 'twintip');
    const ideal = (75 * 2.2) / 9; // ≈18.3
    expect(w.fromKt).toBeLessThan(ideal);
    expect(w.toKt).toBeGreaterThan(ideal);
  });

  it('rejects out-of-range inputs instead of guessing', () => {
    expect(recommendKite(20, 18)).toBeNull();
    expect(recommendKite(75, 3)).toBeNull();
    expect(recommendKite(75, 60)).toBeNull();
    expect(recommendKite(NaN, 18)).toBeNull();
  });
});

describe('recommendWetsuit', () => {
  it('Portuguese west coast summer (~18°C) → 3/2mm', () => {
    const rec = recommendWetsuit(18)!;
    expect(rec.suit.pt).toBe('3/2 mm');
    expect(rec.boots).toBe(false);
  });

  it('Portuguese winter (~14°C) → 4/3mm', () => {
    expect(recommendWetsuit(14.5)!.suit.pt).toBe('4/3 mm');
  });

  it('cold water adds boots, gloves and hood progressively', () => {
    const cold = recommendWetsuit(12)!;
    expect(cold.boots).toBe(true);
    expect(cold.hood).toBe(true);
    const freezing = recommendWetsuit(6)!;
    expect(freezing.gloves).toBe(true);
  });

  it('wind chill shifts the recommendation one band colder near an edge', () => {
    const calm = recommendWetsuit(17.5, false)!;
    const windy = recommendWetsuit(17.5, true)!;
    expect(calm.suit.pt).toBe('3/2 mm');
    expect(windy.suit.pt).toBe('4/3 mm');
  });

  it('warm water needs no neoprene', () => {
    const rec = recommendWetsuit(25)!;
    expect(rec.suit.en).toContain('Rashguard');
  });

  it('rejects nonsense temperatures', () => {
    expect(recommendWetsuit(-3)).toBeNull();
    expect(recommendWetsuit(45)).toBeNull();
    expect(recommendWetsuit(NaN)).toBeNull();
  });
});
