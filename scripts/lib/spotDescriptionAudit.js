/**
 * pt/en spot description audit — shared by the vitest suite
 * (src/lib/__tests__/spotDescriptions.test.ts) and the data validator
 * (scripts/validate-generated-data.js).
 *
 * The spot descriptions live in src/lib/spots.ts as `description` (pt) and
 * `descriptionEn` (en). This module is the single source of the audit rules so
 * the unit tests and the CI data gate can never diverge:
 *
 *   1. every spot has a non-empty pt and en description;
 *   2. descriptionEn is never a verbatim copy of description (normalized
 *      accent/case/whitespace-insensitive);
 *   3. descriptionEn has no Portuguese-only accented words outside the
 *      proper-noun allowlist (a copied, untranslated paragraph is caught by
 *      its leftover Portuguese accents).
 *
 * Pure node (no TS, no aliases) so the validator can require it directly.
 */

/** Nomes próprios portugueses / empréstimos que aparecem legitimamente nas
 *  descrições EN (topónimos, nomes de secções de praia, termos regionais).
 *  Uma palavra com acento português fora desta allowlist numa descrição EN é
 *  uma descrição copiada sem traduzir — traduzir ou justificar aqui. */
const PT_PROPER_NOUNS = new Set([
  'nazaré', // topónimo (Leirosa)
  'baía', // secção de praia (Cantinho da Baía, Baleal)
  'são', // hagiotopónimos (São Julião, São Miguel, São Roque…)
  'julião', // Forte de São Julião (Carcavelos)
  'dragão', // secção de praia (Dragão Vermelho, Caparica)
  'belém', // topónimo (Lisboa / margem sul)
  'setúbal', // cidade
  'gerês', // serra
  'café', // empréstimo adoptado em inglês
]);

/** Caracteres de acentuação exclusivamente portugueses (também comuns a outras línguas românicas). */
const PT_ONLY_CHARS = /[ãõçáéíóúâêôà]/i;

/** Normaliza para comparar cópias: minúsculas, sem diacríticos, espaços colapsados. */
function normalizeForCopy(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Audit an array of spots (any object with `id`, `description`,
 * `descriptionEn`).
 * @returns {{ missing: string[], copies: string[], ptWords: string[] }}
 *   per-spot problem messages, empty when clean.
 */
function auditSpotDescriptions(spots) {
  const missing = [];
  const copies = [];
  const ptWords = [];

  for (const s of spots) {
    const id = s.id || s.slug || '(sem id)';
    if (!s.description || !String(s.description).trim()) {
      missing.push(`${id}: description vazia`);
    }
    if (!s.descriptionEn || !String(s.descriptionEn).trim()) {
      missing.push(`${id}: descriptionEn vazia`);
    }
    if (s.descriptionEn && s.description &&
        normalizeForCopy(s.descriptionEn) === normalizeForCopy(s.description)) {
      copies.push(`${id}: descriptionEn copiada de description (acento/caixa/whitespace-insensitive)`);
    }
    if (s.descriptionEn) {
      const words = String(s.descriptionEn).split(/[^A-Za-zÀ-ÿ]+/);
      for (const raw of words) {
        const w = raw.toLowerCase();
        if (!PT_ONLY_CHARS.test(w)) continue;
        if (PT_PROPER_NOUNS.has(w)) continue;
        ptWords.push(`${id}: "${raw}" (palavra portuguesa na descrição EN)`);
      }
    }
  }

  return { missing, copies, ptWords };
}

module.exports = {
  PT_PROPER_NOUNS,
  PT_ONLY_CHARS,
  normalizeForCopy,
  auditSpotDescriptions,
};
