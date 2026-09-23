import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { countI18nDebt } = require('../i18nDebt.js');

/**
 * Ratchet da dívida i18n (M5).
 *
 * O `lint` só impõe o dicionário nos ficheiros de `MIGRATED_GLOBS`. Este teste
 * fecha a porta ao contrário: a dívida **só pode descer**. Se alguém (ou algum
 * agente) acrescentar copy `isPt ? 'PT' : 'EN'` sem passar pelo dicionário, o
 * CI falha com a lista de ficheiros e o que fazer.
 *
 * Baixar o `BASELINE` quando fechar dívida (é só subtrair); nunca subir sem
 * justificar no PR — é o ponto do ratchet.
 */
const BASELINE = 4;

// Uma medição só (o ESLint sobre `src/` leva ~10 s) — partilhada pelos testes.
const DEBT = await countI18nDebt();

describe('dívida i18n (ratchet)', () => {
  it(
    'não cresce acima do baseline',
    () => {
      const detail = DEBT.rows.map((r) => `  ${r.count}  ${r.file}`).join('\n');
      expect(
        DEBT.ternaries,
        `A dívida i18n cresceu para ${DEBT.ternaries} ternárias (${DEBT.files} ficheiros). ` +
          'Copies bilingues devem ir para o dicionário (`getTranslation(locale)`), ' +
          'não para `isPt ? … : …`. Ver docs/I18N-MIGRATION.md.\n' +
          detail,
      ).toBeLessThanOrEqual(BASELINE);
    },
    60_000,
  );

  it(
    'o baseline está actualizado (margem zero)',
    () => {
      expect(
        DEBT.ternaries,
        `A dívida desceu para ${DEBT.ternaries} — baixa o BASELINE em scripts/lib/__tests__/i18nDebt.test.js ` +
          'para o ratchet apertar.',
      ).toBe(BASELINE);
    },
    60_000,
  );
});
