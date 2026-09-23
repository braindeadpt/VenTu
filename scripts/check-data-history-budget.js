#!/usr/bin/env node
/**
 * Guard de orçamento do histórico de dados (auditoria M8).
 *
 * `scripts/push-data-update.sh` faz `git add -f public/data/` a cada ~30 min:
 * o pipeline recommita 185 ficheiros de previsão (~10 MB) + frames de radar
 * (~2 MB) em cada corrida, e é o histórico do git (não a árvore) que cresce.
 * Este guard fixa um tecto para a árvore TRACKEADA — o primeiro sintoma de uma
 * política de retenção a fugir — e aponta o plano em docs/DATA-HISTORY.md.
 *
 * Não bloqueia o pipeline de dados (esse corre fora do CI); corre no job
 * quality, onde uma subida anormal (novo ficheiro grande, frames a acumular
 * sem prune) aparece antes de se tornar um problema de histórico.
 *
 * Uso: node scripts/check-data-history-budget.js
 *   exit 0 = dentro do orçamento; exit 1 = excedido.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

/** Tecto com folga sobre o estado actual (256 ficheiros / 26 MB em 2026-09-22). */
const BUDGET = { maxFiles: 300, maxBytes: 32 * 1024 * 1024 };

/**
 * @param {{ files: string[], sizes: number[] }} input caminhos trackeados e bytes
 * @returns {{ files: number, bytes: number, violations: string[] }}
 */
function evaluateDataBudget({ files, sizes }) {
  const totalBytes = sizes.reduce((a, b) => a + b, 0);
  const violations = [];
  if (files.length > BUDGET.maxFiles) {
    violations.push(
      `${files.length} ficheiros trackeados em public/data (orçamento ${BUDGET.maxFiles})`,
    );
  }
  if (totalBytes > BUDGET.maxBytes) {
    violations.push(
      `${(totalBytes / 1024 / 1024).toFixed(1)} MB trackeados em public/data (orçamento ${BUDGET.maxBytes / 1024 / 1024} MB)`,
    );
  }
  return { files: files.length, bytes: totalBytes, violations };
}

function trackedDataFiles() {
  const out = execFileSync('git', ['ls-files', '-z', 'public/data'], {
    cwd: ROOT,
    maxBuffer: 16 * 1024 * 1024,
  }).toString('utf-8');
  return out.split('\0').filter(Boolean);
}

function main() {
  const files = trackedDataFiles();
  const sizes = files.map((f) => {
    try {
      return fs.statSync(path.join(ROOT, f)).size;
    } catch {
      return 0;
    }
  });
  const { files: count, bytes, violations } = evaluateDataBudget({ files, sizes });
  if (violations.length > 0) {
    console.error('❌ check-data-history-budget: public/data acima do orçamento\n');
    violations.forEach((v) => console.error(`  - ${v}`));
    console.error('\nVer docs/DATA-HISTORY.md (retenção de frames/forecasts e plano de artefactos).');
    process.exit(1);
  }
  console.log(
    `✅ check-data-history-budget: public/data com ${count} ficheiros / ${(bytes / 1024 / 1024).toFixed(1)} MB (orçamento ${BUDGET.maxFiles}/${BUDGET.maxBytes / 1024 / 1024} MB)`,
  );
}

module.exports = { evaluateDataBudget, BUDGET };

if (require.main === module) main();
