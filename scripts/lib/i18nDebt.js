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

const SELECTOR =
  "ConditionalExpression[test.name='isPt']" +
  ":matches([consequent.type='Literal'][alternate.type='Literal']," +
  "[consequent.type='TemplateLiteral'][alternate.type='TemplateLiteral'])" +
  ":not([consequent.value=/^(pt|en|es|de|fr)(-[A-Z]{2})?$/])" +
  ":not([alternate.value=/^(pt|en|es|de|fr)(-[A-Z]{2})?$/])";

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
          'no-restricted-syntax': ['error', { selector: SELECTOR, message: 'i18n-debt' }],
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

module.exports = { countI18nDebt, DEBT_SELECTOR: SELECTOR };
