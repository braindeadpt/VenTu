import { describe, expect, it } from 'vitest';
import { spots } from '@/lib/spots';
import { SPOT_TAG_EN, SPOT_TAG_IDENTITY, spotTagEn } from '@/lib/spotTagsEn';
import {
  PT_PROPER_NOUNS,
  PT_ONLY_CHARS,
  normalizeForCopy,
  auditSpotDescriptions,
} from '../../../scripts/lib/spotDescriptionAudit.js';

/**
 * A mesma auditoria de placeholders do i18nLocales.test.ts, aplicada aos dados
 * de spot: cada spot tem `description` (pt) e `descriptionEn` (en), e a versão
 * EN nunca pode ser a descrição PT copiada sem traduzir.
 *
 * As REGRAS vivem em scripts/lib/spotDescriptionAudit.js (fonte única,
 * partilhada com o validate-generated-data.js do CI) — estes testes validam a
 * auditoria contra os dados reais E contra dados sintéticos que a disparam.
 */

describe('spot descriptions pt/en', () => {
  it('every spot has a pt and an en description', () => {
    const { missing } = auditSpotDescriptions(spots);
    expect(missing).toEqual([]);
  });

  it('descriptionEn is never a verbatim copy of description (accent/case-insensitive)', () => {
    const { copies } = auditSpotDescriptions(spots);
    expect(copies).toEqual([]);
  });

  it('descriptionEn has no Portuguese-only accented words outside the proper-noun allowlist', () => {
    const { ptWords } = auditSpotDescriptions(spots);
    expect(ptWords).toEqual([]);
  });

  it('the shared audit flags a copied EN description', () => {
    const { copies } = auditSpotDescriptions([
      { id: 'x', description: 'Praia ótima para kite com vento norte.', descriptionEn: 'Praia ótima para kite com vento norte.' },
    ]);
    expect(copies).toEqual([
      'x: descriptionEn copiada de description (acento/caixa/whitespace-insensitive)',
    ]);
  });

  it('the shared audit flags leftover Portuguese words in EN and empty descriptions', () => {
    const { missing, ptWords } = auditSpotDescriptions([
      { id: 'a', description: '', descriptionEn: 'Great spot. Estacionamento fácil.' },
      { id: 'b', description: 'Spot.', descriptionEn: '' },
    ]);
    expect(missing).toEqual(['a: description vazia', 'b: descriptionEn vazia']);
    expect(ptWords).toEqual(['a: "fácil" (palavra portuguesa na descrição EN)']);
  });

  it('the shared audit allows the proper-noun allowlist in EN descriptions', () => {
    const { ptWords } = auditSpotDescriptions([
      { id: 'nazare', description: 'Praia da Nazaré.', descriptionEn: 'Nazaré beach, near São Martinho and Belém-like cliffs.' },
    ]);
    expect(ptWords).toEqual([]);
  });
});

/** Todos os tokens de facilities/hazards usados por qualquer spot. */
function allSpotTags(): { token: string; kind: 'facilities' | 'hazards'; spotId: string }[] {
  const out: { token: string; kind: 'facilities' | 'hazards'; spotId: string }[] = [];
  for (const s of spots) {
    for (const f of s.facilities ?? []) out.push({ token: f, kind: 'facilities', spotId: s.id });
    for (const h of s.hazards ?? []) out.push({ token: h, kind: 'hazards', spotId: s.id });
  }
  return out;
}

/**
 * A auditoria dos arrays facilities/hazards: escritos em pt e renderizados
 * verbatim na UI EN até serem mapeados por spotTagEn. Cada token precisa de
 * entrada no dicionário (ou allowlist de identidade), e a entrada nunca pode
 * ser o token PT copiado sem traduzir — o mesmo contrato das descriptions.
 */
describe('spot facilities/hazards pt/en', () => {
  it('every facility/hazard token has an EN entry (SPOT_TAG_EN or SPOT_TAG_IDENTITY)', () => {
    const missing = new Set<string>();
    for (const { token } of allSpotTags()) {
      if (SPOT_TAG_EN[token] === undefined && !SPOT_TAG_IDENTITY.has(token)) missing.add(token);
    }
    expect([...missing].sort()).toEqual([]);
  });

  it('SPOT_TAG_EN entries are never the PT token verbatim (normalized), unless allowlisted as identity', () => {
    const copies: string[] = [];
    for (const [pt, en] of Object.entries(SPOT_TAG_EN)) {
      if (SPOT_TAG_IDENTITY.has(pt)) continue;
      if (normalizeForCopy(en) === normalizeForCopy(pt)) copies.push(`${pt} → ${en}`);
    }
    expect(copies).toEqual([]);
  });

  it('every EN entry is actually used by a spot (no dead dictionary keys)', () => {
    const used = new Set(allSpotTags().map((t) => t.token));
    const dead = Object.keys(SPOT_TAG_EN).filter((k) => !used.has(k));
    expect(dead.sort()).toEqual([]);
  });

  it('spotTagEn maps every used token to a different string (or identity), never the raw PT for translatable tags', () => {
    const raw: string[] = [];
    for (const { token } of allSpotTags()) {
      if (SPOT_TAG_IDENTITY.has(token)) continue;
      if (spotTagEn(token) === token) raw.push(token);
    }
    expect(raw.sort()).toEqual([]);
  });
});

// As regras de acentuação vivem no módulo partilhado — trancar que o allowlist
// e a regex são exactamente os que a auditoria usa (nada de cópias divergentes).
describe('spotDescriptionAudit shared module', () => {
  it('PT_PROPER_NOUNS and PT_ONLY_CHARS match the audit behavior', () => {
    expect(PT_PROPER_NOUNS.has('nazaré')).toBe(true);
    expect(PT_ONLY_CHARS.test('coração')).toBe(true);
    expect(PT_ONLY_CHARS.test('beach')).toBe(false);
  });

  it('normalizeForCopy collapses case/accents/whitespace for copy comparison', () => {
    expect(normalizeForCopy('  Praia  ótima ')).toBe(normalizeForCopy('praia otima'));
  });
});
