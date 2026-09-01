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
  'Chat', 'Feedback', 'Links', 'Livecams', 'Livecams →', 'Powered by', 'Rankings', 'Reset',
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
  'Top 1 para', 'Top 3 para', 'Últimas', 'Ver', 'Ver todos',
  'Hora', 'Ordenar', 'Recursos', 'Ver spot',
]);

/**
 * Cognatos válidos em inglês — a palavra inglesa é exactamente a mesma que a
 * portuguesa ou o projecto usa o termo inglês adoptado em PT (Score, Surf,
 * etc.). Igualar o valor pt é uma tradução correcta (ex.: «Spots» é a mesma
 * palavra em ambos). Não se aplicam a de/fr.
 */
const EN_COGNATES = new Set([
  'About', 'Abrir mapa', 'Alerts', 'Altura total', 'Big Wave', 'Bodyboard',
  'Chat', 'Comparar', 'cross', 'Entrar', 'Feedback', 'Foil', 'GitHub',
  'Idioma', 'Kitesurf', 'kW/m', 'Legal', 'Links', 'Livecams', 'Mapa',
  'Mar total', 'Modalidades', 'offshore', 'onshore', 'Open-Meteo', 'Pausado',
  'Pausar radar', 'Perfil', 'Powered by', 'Radar', 'Radar IPMA', 'Rankings',
  'Reset', 'Score', 'spots', 'Spots', 'SUP', 'Surf', 'Swell', 'Top score',
  'VenTu', 'VenTu. Open Source Project.', 'Ver spot', 'Wakeboard', 'Windsurf',
  '{count} spots',
]);

/** Allowlist por locale — cada valor idêntico ao pt tem de estar justificado. */
const IDENTICAL_ALLOWLIST: Record<'en' | 'es' | 'de' | 'fr', Set<string>> = {
  en: EN_COGNATES,
  es: new Set([...SHARED_TOKENS, ...ES_COGNATES]),
  de: SHARED_TOKENS,
  fr: SHARED_TOKENS,
};

/**
 * Keys que existem SÓ no bloco pt, de propósito: são o valor EN embutido usado
 * pela UI quando o locale não é pt (ex. `hero.filteredSpotsEn`). Nunca devem
 * ser exigidas aos shells es/de/fr nem ao en.
 */
const PT_ONLY_KEYS = new Set(['hero.filteredSpotsEn', 'hero.sortedByScoreEn']);

/** Cadeias de atribuição de dados do footer (modelos/observações/notícias). */
const FOOTER_ATTRIB_KEYS = [
  'attribWaves',
  'attribWind',
  'attribObservations',
  'attribNews',
] as const;

/**
 * Valores dos shells iguais ao EN que SÃO traduções legítimas — a palavra é a
 * mesma na língua (ex. «Wind» e «News» são alemão). Tudo o resto que iguale o
 * valor EN conta como fallback/cola não traduzida nas cadeias de atribuição.
 * (O teste genérico já garante presença e não-igualdade ao placeholder PT; este
 * conjunto bloqueia a regressão para o EN, que o teste PT não apanha.)
 */
const EN_EQUAL_ATTR_ALLOWLIST: Record<'es' | 'de' | 'fr', Set<string>> = {
  es: new Set(),
  de: new Set([
    'Wind: DWD ICON-EU / ECMWF / GFS / Météo-France', // «Wind» é alemão
    'News: Gemini Flash', // «News» adoptado em alemão
  ]),
  fr: new Set(),
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

  it('en/es/de/fr map blocks carry every key of pt (no empty radar labels)', () => {
    const ptMap = getTranslation('pt').map;
    for (const loc of ['en', 'es', 'de', 'fr'] as const) {
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

  it('en/es/de/fr carry every key of pt in every block (shells never fall back)', () => {
    const ptBlock = getTranslation('pt') as unknown as Record<string, unknown>;
    for (const loc of ['en', 'es', 'de', 'fr'] as const) {
      const locBlock = getTranslation(loc) as unknown as Record<string, unknown>;
      const missing: string[] = [];
      const walk = (path: string, a: Record<string, unknown>, b: Record<string, unknown>): void => {
        for (const [k, v] of Object.entries(a)) {
          const p = path ? `${path}.${k}` : k;
          if (v && typeof v === 'object') {
            const bv = b[k];
            if (bv && typeof bv === 'object') {
              walk(p, v as Record<string, unknown>, bv as Record<string, unknown>);
            } else {
              missing.push(p);
            }
          } else if (!(k in b)) {
            if (!PT_ONLY_KEYS.has(p)) missing.push(p);
          }
        }
      };
      walk('', ptBlock, locBlock);
      expect(missing, `${loc} missing keys (shell falls back to EN)`).toEqual([]);
    }
  });

  it('en/es/de/fr: nenhum valor ficou igual ao placeholder português (traduções esquecidas)', () => {
    const ptBlock = getTranslation('pt') as unknown as Record<string, unknown>;
    const violations: string[] = [];

    for (const loc of ['en', 'es', 'de', 'fr'] as const) {
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

  it('es/de/fr: as cadeias de atribuição do footer (attrib*) nunca regressam a fallback EN', () => {
    const enFooter = getTranslation('en').footer as unknown as Record<string, unknown>;
    const ptFooter = getTranslation('pt').footer as unknown as Record<string, unknown>;

    for (const loc of ['es', 'de', 'fr'] as const) {
      const shellFooter = getTranslation(loc).footer as unknown as Record<string, unknown>;
      for (const key of FOOTER_ATTRIB_KEYS) {
        // Presença (o genérico também garante; aqui é explícito e nomeado).
        expect(shellFooter, `${loc}.footer.${key} em falta (fallback EN)`).toHaveProperty(key);
        const val = shellFooter[key];
        expect(typeof val, `${loc}.footer.${key} não é string`).toBe('string');
        const s = val as string;
        // Não igual ao placeholder português (o genérico cobre; explícito aqui).
        expect(
          s === ptFooter[key],
          `${loc}.footer.${key} igual ao placeholder PT — traduzir`,
        ).toBe(false);
        // Não igual ao EN, salvo allowlist de palavras idênticas na língua.
        if (s === String(enFooter[key])) {
          expect(
            EN_EQUAL_ATTR_ALLOWLIST[loc].has(s),
            `${loc}.footer.${key} igual ao valor EN sem justificação — traduzir ou listar em EN_EQUAL_ATTR_ALLOWLIST`,
          ).toBe(true);
        }
      }
    }
  });
});
