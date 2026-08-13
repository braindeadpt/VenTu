#!/usr/bin/env node
/**
 * Valida as expressões WAF do Cloudflare Ruleset Engine (sintaxe, sem token
 * da API) em todas as fontes do repo:
 *   - todos os `terraform/*.tf` (main.tf tem as 5 expressões; variables.tf
 *     passa em silêncio — só falha se contém `expression =` e nada extrai)
 *   - docs/SECURITY-HEADERS.md (as equivalências curl/painel — `**Filter:**`
 *     e `**Expression:**`)
 *   - drift: cada expressão do terraform/ tem de existir no doc e vice-versa
 *     (o doc é a fonte de verdade; o terraform apenas replica)
 *
 * Usage:
 *   node scripts/validate-terraform-expressions.js            # modo completo
 *   node scripts/validate-terraform-expressions.js FICHEIRO.tf # só um ficheiro
 *
 * Exit: 0 = tudo válido, 1 = inválido/drift, 2 = erro de leitura.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  validateTerraformFile,
  validateMarkdownFile,
  extractExpressions,
  extractMarkdownExpressions,
  checkExpressionDrift,
} = require('./lib/terraformExpressions.js');

const TERRAFORM_DIR = process.env.WAF_TF_DIR || path.join(__dirname, '../terraform');
const DOCS_FILE = process.env.WAF_DOCS_FILE || path.join(__dirname, '../docs/SECURITY-HEADERS.md');

// ── Modo 1 ficheiro (compat): valida só esse .tf como antes ─────────────
if (process.argv[2]) {
  const file = path.resolve(process.argv[2]);
  let result;
  try {
    result = validateTerraformFile(file);
  } catch (err) {
    console.error(`❌ Erro a ler ${file}: ${err.message}`);
    process.exit(2);
  }
  for (const problem of result.problems) console.error(`❌ ${problem}`);
  if (result.ok) {
    console.log(`✅ ${result.count} expressões WAF válidas (ruleset engine) em ${path.basename(file)}`);
    process.exit(0);
  }
  console.error(`❌ ${result.problems.length} problema(s) — rever as expressões de ${path.basename(file)}`);
  process.exit(1);
}

// ── Modo completo: terraform/*.tf + SECURITY-HEADERS.md + drift ─────────
const allProblems = [];
const tfExprs = [];

for (const name of fs.readdirSync(TERRAFORM_DIR).filter((f) => f.endsWith('.tf')).sort()) {
  const file = path.join(TERRAFORM_DIR, name);
  let result;
  try {
    result = validateTerraformFile(file);
  } catch (err) {
    console.error(`❌ Erro a ler ${file}: ${err.message}`);
    process.exit(2);
  }
  for (const problem of result.problems) allProblems.push(problem);
  if (result.ok && result.count > 0) {
    console.log(`✅ ${name}: ${result.count} expressões válidas`);
  } else if (result.ok) {
    console.log(`ℹ️  ${name}: sem expressões (ok)`);
  } else {
    console.log(`❌ ${name}: ${result.problems.length} problema(s)`);
  }
  if (result.count > 0) {
    // Re-extrai para o drift (validateTerraformFile não devolve as expressões).
    tfExprs.push(
      ...extractExpressions(fs.readFileSync(file, 'utf8')).map((e) => ({ ...e, where: `${name} ${e.where}` })),
    );
  }
}

let docResult;
try {
  docResult = validateMarkdownFile(DOCS_FILE);
} catch (err) {
  console.error(`❌ Erro a ler ${DOCS_FILE}: ${err.message}`);
  process.exit(2);
}
for (const problem of docResult.problems) allProblems.push(problem);
if (docResult.ok && docResult.count > 0) {
  console.log(`✅ SECURITY-HEADERS.md: ${docResult.count} expressões válidas`);
} else if (docResult.ok) {
  console.log('ℹ️  SECURITY-HEADERS.md: sem expressões WAF');
} else {
  console.log(`❌ SECURITY-HEADERS.md: ${docResult.problems.length} problema(s)`);
}

const docExprs = extractMarkdownExpressions(fs.readFileSync(DOCS_FILE, 'utf8'));
const drift = checkExpressionDrift(tfExprs, docExprs);
if (drift.length > 0) {
  console.error(`❌ Drift terraform/ ↔ SECURITY-HEADERS.md (${drift.length}):`);
  for (const d of drift) console.error(`  - ${d}`);
}
allProblems.push(...drift);

if (allProblems.length > 0) {
  console.error(`\n❌ ${allProblems.length} problema(s) — rever as expressões WAF`);
  process.exit(1);
}
console.log(
  `\n✅ ${tfExprs.length} expressões no terraform/ + ${docExprs.length} no SECURITY-HEADERS.md — sem drift, todas válidas (ruleset engine)`,
);
process.exit(0);
