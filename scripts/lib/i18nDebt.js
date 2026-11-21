'use strict';
/**
 * Medição da dívida i18n (M5) — mesma regra do `eslint.config.mjs`
 * (`isPt ? 'pt' : 'EN'`), aplicada a TODO o `src/`, incluindo ficheiros que
 * ainda não estão em `MIGRATED_GLOBS`.
 *
 * Vive aqui (e não no script) para ser reutilizável pelo relatório
 * (`scripts/i18n-debt-report.js`) e pelo ratchet do CI
 * (`scripts/lib/__tests__/i18nDebt.test.js`).
 */

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

const LOCALE_CODE = '^(pt|en|es|de|fr)(-[A-Z]{2})?$';

// Qualquer ternário `isPt ? … : …` ou `locale === 'pt' ? … : …` em que nenhum
// dos ramos é um código de língua — literais, templates, JSX, campos pt/en,
// chamadas. O selector antigo só media literais/templates e deixava de fora
// os pares `isPt ? x.pt : x.en` e os blocos JSX bilingues.
const SELECTORS = [
  `ConditionalExpression[test.name='isPt']` +
    `:not([consequent.value=/${LOCALE_CODE}/])` +
    `:not([alternate.value=/${LOCALE_CODE}/])`,
  `ConditionalExpression[test.type='BinaryExpression'][test.operator='===']` +
    `[test.left.name='locale'][test.right.value='pt']` +
    `:not([consequent.value=/${LOCALE_CODE}/])` +
    `:not([alternate.value=/${LOCALE_CODE}/])`,
];

/**
 * @returns {Promise<{files:number, ternaries:number, bySurface:Record<string,number>,
 *   rows:Array<{file:string,count:number}>, cleanFiles:number}>}
 */
async function countI18nDebt() {
  // eslint é devDependency do app; resolvido a partir do repo.
  const { ESLint } = require(path.join(ROOT, 'node_modules', 'eslint'));
  const eslint = new ESLint({
    cwd: ROOT,
    overrideConfigFile: path.join(ROOT, 'eslint.config.mjs'),
    overrideConfig: [
      {
        files: ['src/**/*.{ts,tsx}'],
        rules: {
          'no-restricted-syntax': [
            'error',
            ...SELECTORS.map((selector) => ({ selector, message: 'i18n-debt' })),
          ],
        },
      },
    ],
  });

  const results = await eslint.lintFiles(['src']);
  const rows = results
    .map((r) => ({
      file: path.relative(ROOT, r.filePath),
      count: r.messages.filter((m) => m.ruleId === 'no-restricted-syntax').length,
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));

  const ternaries = rows.reduce((a, r) => a + r.count, 0);
  const bySurface = {};
  for (const r of rows) {
    const key = r.file.split('/').slice(0, 3).join('/');
    bySurface[key] = (bySurface[key] ?? 0) + r.count;
  }

  return { files: rows.length, ternaries, bySurface, rows, cleanFiles: results.length - rows.length };
}

module.exports = { countI18nDebt, DEBT_SELECTOR: SELECTORS };
