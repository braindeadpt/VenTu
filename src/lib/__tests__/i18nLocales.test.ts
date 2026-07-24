import { describe, expect, it } from 'vitest';
import {
  getTranslation,
  pickLocale,
  resolvePreferredLocale,
  validateLocale,
  locales,
} from '@/lib/i18n';

describe('i18n locales', () => {
  it('includes pt, en, es, de, fr', () => {
    expect([...locales]).toEqual(['pt', 'en', 'es', 'de', 'fr']);
  });

  it('validateLocale falls back to pt', () => {
    expect(validateLocale('xx')).toBe('pt');
    expect(validateLocale('es')).toBe('es');
  });

  it('resolvePreferredLocale prefers stored then navigator prefix', () => {
    expect(resolvePreferredLocale('es', 'en-US')).toBe('es');
    expect(resolvePreferredLocale(null, 'es-ES')).toBe('es');
    expect(resolvePreferredLocale(null, 'fr-FR')).toBe('fr');
    expect(resolvePreferredLocale(null, 'it-IT')).toBe('en');
    expect(resolvePreferredLocale(null, null)).toBe('pt');
  });

  it('pickLocale uses es when present else en', () => {
    expect(pickLocale('es', { pt: 'A', en: 'B', es: 'C' })).toBe('C');
    expect(pickLocale('es', { pt: 'A', en: 'B' })).toBe('B');
  });

  it('getTranslation returns Spanish shell for es', () => {
    const t = getTranslation('es');
    expect(t.hero.exploreMap).toBe('Explorar mapa');
    expect(t.nav.home).toBe('Inicio');
    expect(t.hero.onCount).toBe('a tope');
  });

  it('getTranslation returns German shell for de', () => {
    const t = getTranslation('de');
    expect(t.hero.exploreMap).toBe('Karte erkunden');
    expect(t.nav.home).toBe('Startseite');
    expect(t.hero.onCount).toBe('laufen');
  });

  it('getTranslation returns French shell for fr', () => {
    const t = getTranslation('fr');
    expect(t.hero.exploreMap).toBe('Explorer la carte');
    expect(t.nav.home).toBe('Accueil');
    expect(t.hero.onCount).toBe('à fond');
  });
});
