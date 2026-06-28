import { describe, it, expect } from 'vitest';
import {
  verificationBadge,
  getObservedAgeHours,
  formatObservedAge,
  observedSourceLabel,
  observedSectionTitle,
  observedWindDisclaimer,
} from '@/lib/observations';

describe('verificationBadge', () => {
  it('returns match badge in PT', () => {
    const badge = verificationBadge('match', 'pt');
    expect(badge.label).toBe('Converge');
    expect(badge.symbol).toBe('✓');
    expect(badge.className).toContain('score-good');
  });

  it('returns match badge in EN', () => {
    const badge = verificationBadge('match', 'en');
    expect(badge.label).toBe('Match');
  });

  it('returns near badge in PT', () => {
    const badge = verificationBadge('near', 'pt');
    expect(badge.label).toBe('Próximo');
    expect(badge.symbol).toBe('~');
    expect(badge.className).toContain('score-fair');
  });

  it('returns near badge in EN', () => {
    const badge = verificationBadge('near', 'en');
    expect(badge.label).toBe('Near');
  });

  it('returns off badge in PT', () => {
    const badge = verificationBadge('off', 'pt');
    expect(badge.label).toBe('Diverge');
    expect(badge.symbol).toBe('⚠');
    expect(badge.className).toContain('score-poor');
  });

  it('returns off badge in EN', () => {
    const badge = verificationBadge('off', 'en');
    expect(badge.label).toBe('Off');
  });
});

describe('getObservedAgeHours', () => {
  it('returns approximate age in hours for a past timestamp', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const age = getObservedAgeHours(twoHoursAgo);
    expect(age).toBeGreaterThanOrEqual(1.9);
    expect(age).toBeLessThanOrEqual(2.1);
  });

  it('returns null for invalid date', () => {
    expect(getObservedAgeHours('invalid')).toBeNull();
  });

  it('returns null for future date', () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(getObservedAgeHours(future)).toBeNull();
  });
});

describe('formatObservedAge', () => {
  it('formats hours and minutes in PT', () => {
    const old = new Date(Date.now() - 90 * 60_000).toISOString();
    const formatted = formatObservedAge(old, 'pt');
    expect(formatted).toMatch(/há 1h30m/);
  });

  it('formats hours and minutes in EN', () => {
    const old = new Date(Date.now() - 90 * 60_000).toISOString();
    const formatted = formatObservedAge(old, 'en');
    expect(formatted).toMatch(/1h 30m ago/);
  });

  it('formats whole hours without remainder', () => {
    const old = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const ptAge = formatObservedAge(old, 'pt');
    expect(ptAge).toMatch(/há 2h$/);
  });

  it('returns "agora" / "just now" for future timestamps', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(formatObservedAge(future, 'pt')).toBe('agora');
    expect(formatObservedAge(future, 'en')).toBe('just now');
  });

  it('returns "agora" for invalid date in PT', () => {
    expect(formatObservedAge('invalid', 'pt')).toBe('agora');
  });
});

describe('observedSourceLabel', () => {
  it('returns IPMA for ipma source', () => {
    expect(observedSourceLabel('ipma', 'pt')).toBe('IPMA');
    expect(observedSourceLabel('ipma', 'en')).toBe('IPMA');
  });

  it('returns Ecowitt for ecowitt source', () => {
    expect(observedSourceLabel('ecowitt', 'pt')).toBe('Ecowitt');
    expect(observedSourceLabel('ecowitt', 'en')).toBe('Ecowitt');
  });
});

describe('observedSectionTitle', () => {
  it('returns "Observado agora" for fresh IPMA in PT', () => {
    expect(observedSectionTitle('ipma', true, 'pt')).toBe('Observado agora');
  });

  it('returns "Observed now" for fresh in EN', () => {
    expect(observedSectionTitle('ipma', true, 'en')).toBe('Observed now');
  });

  it('includes source name when not fresh in PT', () => {
    expect(observedSectionTitle('ipma', false, 'pt')).toContain('IPMA');
  });

  it('includes source name when not fresh in EN', () => {
    expect(observedSectionTitle('ecowitt', false, 'en')).toContain('Ecowitt');
  });
});

describe('observedWindDisclaimer', () => {
  it('returns IPMA disclaimer in PT', () => {
    const d = observedWindDisclaimer('ipma', 'pt');
    expect(d).toContain('IPMA');
    expect(d).toContain('line-up');
  });

  it('returns IPMA disclaimer in EN', () => {
    const d = observedWindDisclaimer('ipma', 'en');
    expect(d).toContain('Land IPMA station');
  });

  it('returns Ecowitt disclaimer in PT', () => {
    const d = observedWindDisclaimer('ecowitt', 'pt');
    expect(d).toContain('Ecowitt');
  });

  it('returns Ecowitt disclaimer in EN', () => {
    const d = observedWindDisclaimer('ecowitt', 'en');
    expect(d).toContain('Ecowitt PWS');
  });
});
