#!/usr/bin/env node
/**
 * Relatório (só leitura) da dívida i18n — auditoria M5.
 *
 * Aplica a mesma regra do eslint.config.mjs (`isPt ? 'pt' : 'EN'`) a TODO o
 * src/, mesmo aos ficheiros que ainda não estão em MIGRATED_GLOBS, e conta os
 * ternários de copy por ficheiro. Serve para (a) escolher a próxima superfície
 * a migrar e (b) medir o progresso entre sessões.
 *
 * A regra não é imposta fora de MIGRATED_GLOBS: este script é um medidor, não
 * um gate (usar `npm run lint` para o gate dos ficheiros já migrados).
 *
 * Uso: node scripts/i18n-debt-report.js [--json]
 */

const path = require('path');

const ROOT = path.join(__dirname, '..');
const SELECTOR =
  "ConditionalExpression[test.name='isPt']" +
  ":matches([consequent.type='Literal'][alternate.type='Literal']," +
  "[consequent.type='TemplateLiteral'][alternate.type='TemplateLiteral'])" +
  ":not([consequent.value=/^(pt|en|es|de|fr)(-[A-Z]{2})?$/])" +
  ":not([alternate.value=/^(pt|en|es|de|fr)(-[A-Z]{2})?$/])";

async function main() {
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

  const total = rows.reduce((a, r) => a + r.count, 0);
  const bySurface = {};
  for (const r of rows) {
    const key = r.file.split('/').slice(0, 3).join('/');
    bySurface[key] = (bySurface[key] ?? 0) + r.count;
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ files: rows.length, ternaries: total, bySurface, rows }, null, 2));
    return;
  }

  console.log(
    `Dívida i18n: ${total} ternários de copy em ${rows.length} ficheiros (${results.length - rows.length} ficheiros src limpos)\n`,
  );
  console.log('Por superfície:');
  for (const [surface, count] of Object.entries(bySurface).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${surface}`);
  }
  console.log('\nTop ficheiros:');
  for (const r of rows.slice(0, 12)) console.log(`  ${String(r.count).padStart(4)}  ${r.file}`);
  console.log('\nPlano e método: docs/I18N-MIGRATION.md');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
