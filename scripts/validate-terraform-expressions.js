#!/usr/bin/env node
/**
 * Valida as expressões WAF do terraform/main.tf contra a sintaxe do
 * Cloudflare Ruleset Engine (sem token da API).
 *
 * Usage:
 *   node scripts/validate-terraform-expressions.js [FICHEIRO.tf]
 *   # default: terraform/main.tf
 *
 * Exit: 0 = todas válidas, 1 = pelo menos uma inválida, 2 = erro de leitura.
 */
'use strict';

const path = require('path');
const { validateTerraformFile } = require('./lib/terraformExpressions.js');

const FILE = process.argv[2] || path.join(__dirname, '../terraform/main.tf');

let result;
try {
  result = validateTerraformFile(FILE);
} catch (err) {
  console.error(`❌ Erro a ler ${FILE}: ${err.message}`);
  process.exit(2);
}

for (const problem of result.problems) {
  console.error(`❌ ${problem}`);
}

if (result.ok) {
  console.log(`✅ ${result.count} expressões WAF válidas (ruleset engine) em ${path.basename(FILE)}`);
  process.exit(0);
}

console.error(`❌ ${result.problems.length} problema(s) — rever as expressões de ${path.basename(FILE)}`);
process.exit(1);
