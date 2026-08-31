import { describe, expect, it } from 'vitest';
import {
  getTranslation,
  pickLocale,
  resolvePreferredLocale,
  validateLocale,
  locales,
} from '@/lib/i18n';

/**
 * Valores legítimos por serem IDÊNTICOS em todas as línguas — nunca devem ser
 * traduzidos, por isso não contam como «tradução esquecida»:
 *  - Marcas / nomes próprios (Open-Meteo, VenTu, …);
 *  - Desportos com o mesmo nome (Surf, Kitesurf, …);
 *  - Termos técnicos ingleses adoptados (Score, Swell, Chat, Feedback, …).
 */
const SHARED_TOKENS = new Set([
  'Open-Meteo', 'GitHub', 'VenTu', 'VenTu. Open Source Project.',
  'Big Wave', 'Bodyboard', 'Foil', 'Kitesurf', 'SUP', 'Surf', 'Wakeboard', 'Windsurf',
  'Chat', 'Feedback', 'Links', 'Livecams', 'Powered by', 'Rankings', 'Reset',
  'Score', 'Swell', 'Top score', 'Radar', 'Radar IPMA', 'spots', 'Spots',
  'cross', 'offshore', 'onshore', 'kW/m', '{count} spots',
]);

/**
 * Cognatos válidos em espanhol — a palavra espanhola é exactamente a mesma
 * que a portuguesa, por isso igualar o valor pt é uma tradução correcta
 * (ex.: «Explorar mapa» é espanhol válido). Não se aplicam a de/fr.
 */
const ES_COGNATES = new Set([
  'Abrir mapa', 'Actualizado', 'Agrupar spots', 'Alertas', 'Altura total',
  'Calculadora de kite', 'Comparar', 'Entrada gratuita', 'Entrar', 'Épico',
  'Excelente', 'Explorar', 'Explorar lista completa', 'Explorar mapa',
  'Favoritos', 'Filtrar por', 'Idioma', 'Legal', 'Logística', 'Mapa',
  'Mar total', 'Menos horas', 'Métricas', 'Modalidades', 'Mostrar filtros',
  'Mostrar todos',  'Ocultar filtros', 'Ocultar radar', 'Ordenados por score', 'Pausado', 'Pausar radar',
  'Perfil', 'Próximos eventos', 'Resumido por IA', 'Resultados', 'Satélite',
  'Spots filtrados', 'spots monitorizados', 'Swell ideal', 'Todos',
  'Top 1 para', 'Top 3 para', 'Últimas', 'Ver spot', 'Ver todos',
]);

/** Allowlist por locale — cada valor idêntico ao pt tem de estar justificado. */
const IDENTICAL_ALLOWLIST: Record<'es' | 'de' | 'fr', Set<string>> = {
  es: new Set([...SHARED_TOKENS, ...ES_COGNATES]),
  de: SHARED_TOKENS,
  fr: SHARED_TOKENS,
};

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

  it('es/de/fr map blocks carry every key of pt (no empty radar labels)', () => {
    const ptMap = getTranslation('pt').map;
    for (const loc of ['es', 'de', 'fr'] as const) {
      const mapBlock = getTranslation(loc).map;
      for (const key of Object.keys(ptMap)) {
        expect(mapBlock, `${loc}.map.${key} missing`).toHaveProperty(key);
      }
      expect(mapBlock.showRadar).toBeTruthy();
      expect(mapBlock.hideRadar).toBeTruthy();
      expect(mapBlock.radarHint).toBeTruthy();
      expect(mapBlock.radarBadge).toBeTruthy();
    }
  });

  it('es/de/fr: nenhum valor ficou igual ao placeholder português (traduções esquecidas)', () => {
    const ptBlock = getTranslation('pt') as unknown as Record<string, unknown>;
    const violations: string[] = [];

    for (const loc of ['es', 'de', 'fr'] as const) {
      const allowed = IDENTICAL_ALLOWLIST[loc];
      const locBlock = getTranslation(loc) as unknown as Record<string, unknown>;

      const walk = (path: string, a: Record<string, unknown>, b: Record<string, unknown>): void => {
        for (const [k, v] of Object.entries(a)) {
          const p = path ? `${path}.${k}` : k;
          if (v && typeof v === 'object') {
            const bv = b[k];
            if (bv && typeof bv === 'object') {
              walk(p, v as Record<string, unknown>, bv as Record<string, unknown>);
            }
          } else if (typeof v === 'string' && b[k] === v) {
            const val = v as string;
            // Valores vazios / sem letras (números, pontuação) não são traduções.
            if (val.trim() === '' || !/[\p{L}]/u.test(val)) continue;
            if (allowed.has(val)) continue;
            violations.push(
              `${loc}.${p} = ${JSON.stringify(val)} (igual ao placeholder pt — traduzir ou justificar na allowlist)`,
            );
          }
        }
      };

      walk('', ptBlock, locBlock);
    }

    expect(violations).toEqual([]);
  });
});
