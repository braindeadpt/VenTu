#!/usr/bin/env node
/**
 * Relatório (só leitura) da dívida i18n — auditoria M5.
 *
 * Usa `scripts/lib/i18nDebt.js` (a mesma regra do `eslint.config.mjs`,
 * aplicada a todo o `src/`) e imprime a dívida por superfície. Serve para
 * (a) escolher a próxima superfície a migrar e (b) medir o progresso.
 *
 * O gate dos ficheiros já migrados é o `npm run lint`; o ratchet (impedir que
 * a dívida cresça) é o teste `scripts/lib/__tests__/i18nDebt.test.js`.
 *
 * Uso: node scripts/i18n-debt-report.js [--json]
 */

'use strict';

const { countI18nDebt } = require('./lib/i18nDebt.js');

async function main() {
  const { ternaries, files, bySurface, rows, cleanFiles } = await countI18nDebt();

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ files, ternaries, bySurface, rows }, null, 2));
    return;
  }

  console.log(
    `Dívida i18n: ${ternaries} ternários de copy em ${files} ficheiros (${cleanFiles} ficheiros src limpos)\n`,
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
