#!/usr/bin/env node
'use strict';

/**
 * Guarda de CI: nenhum controlo de camada do mapa tem nome dependente do
 * estado (regra «nome = modo»).
 *
 * Um toggle de camada diz o estado no `aria-pressed` — o nome acessível é a
 * CAMADA e não muda quando se liga («Vento», «Radar IPMA», «Agrupar spots»,
 * «Só a bombar»). Um `aria-label` alternado («Mostrar vento» ↔ «Ocultar vento»)
 * faz o leitor de ecrã anunciar «Ocultar vento, premido» com a camada LIGADA.
 * A regra já foi reintroduzida três vezes (cluster, «só a bombar», camadas do
 * HUD); este passo falha o job quality se voltar a acontecer.
 *
 * Corre no job quality (rápido, sem browser). A análise vive em
 * scripts/lib/mapLayerNames.js (pura, com testes unitários).
 *
 * Uso: node scripts/check-map-layer-names.js
 *   exit 0 = todos os toggles com nome constante; exit 1 = violação (ou escopo
 *   vazio, que também falha — um guarda que não vê nada não guarda nada).
 */

const fs = require('fs');
const path = require('path');
const {
  LAYER_SCOPE_DIRS,
  LAYER_SCOPE_FILES,
  TRANSPORT_FILES,
  scanLayerControls,
  validateScope,
} = require('./lib/mapLayerNames.js');

const ROOT = path.join(__dirname, '..');

/**
 * Piso de cobertura. O escopo real tem hoje 30 ficheiros e 10 toggles; o piso
 * fica abaixo disso para não falhar por churn legítimo (um botão fundido com
 * outro), mas alto o suficiente para o guarda não passar a verde quando o
 * escopo muda de sítio (ficheiros renomeados/movidos) e ele deixa de ver
 * toggles. Mexer no piso faz parte do commit que mexer no escopo.
 */
const MIN_FILES = 6;
const MIN_TOGGLES = 8;

/** Todos os `.ts`/`.tsx` do escopo, relativos à raiz e por ordem estável. */
function collectFiles() {
  const out = [];
  const walk = (absDir, relDir) => {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return; // directoria ausente: o piso de cobertura trata disso
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(absDir, e.name);
      const rel = `${relDir}/${e.name}`;
      if (e.isDirectory()) walk(abs, rel);
      else if (/\.tsx?$/.test(e.name)) out.push(rel);
    }
  };
  for (const dir of LAYER_SCOPE_DIRS) walk(path.join(ROOT, dir), dir);
  for (const file of LAYER_SCOPE_FILES) {
    if (fs.existsSync(path.join(ROOT, file)) && !out.includes(file)) out.push(file);
  }
  return out;
}

function main() {
  const all = collectFiles().map((rel) => ({
    path: rel,
    source: fs.readFileSync(path.join(ROOT, rel), 'utf-8'),
  }));
  const files = all.filter((f) => !TRANSPORT_FILES.includes(f.path));

  const { violations, toggles } = scanLayerControls(files);

  // A configuração do guarda tem de continuar a apontar para código real: uma
  // excepção com caminho antigo (rename/movimento) ou já sem toggles passaria a
  // esconder exactamente o que devia vigiar.
  const { missing, pointlessTransport } = validateScope(all);

  const scopeProblems = [];
  for (const p of missing) {
    scopeProblems.push(
      `${p} está no escopo/excepções mas não existe neste checkout — ficheiro movido/renomeado (ou ramo atrás de main): actualizar a configuração do guarda`,
    );
  }
  for (const p of pointlessTransport) {
    scopeProblems.push(`${p} está em TRANSPORT_FILES mas já não tem toggles — excepção sem objecto, remover`);
  }
  if (files.length < MIN_FILES) {
    scopeProblems.push(
      `escopo com ${files.length} ficheiros (mínimo ${MIN_FILES}) — o guarda deixou de ver os controlos de camada`,
    );
  }
  if (toggles < MIN_TOGGLES) {
    scopeProblems.push(
      `escopo com ${toggles} toggles (mínimo ${MIN_TOGGLES}) — o guarda deixou de ver os controlos de camada`,
    );
  }

  if (violations.length > 0 || scopeProblems.length > 0) {
    console.error('❌ check-map-layer-names: controlos de camada do mapa\n');
    for (const v of violations) {
      console.error(`::error file=${v.file},line=${v.line}::${v.expression}`);
      console.error(`  - ${v.file}:${v.line} — aria-label dependente do estado: ${v.expression}`);
    }
    for (const p of scopeProblems) console.error(`  - ${p}`);
    console.error('');
    if (violations.length > 0) {
      console.error(
        'Regra: o nome da camada é constante («Vento», «Agrupar spots»); o estado vive no aria-pressed.',
      );
      console.error('Ver docs/CONTEXT.md § «nome = modo» (acessibilidade do mapa).');
    }
    process.exit(1);
  }

  console.log(
    `✅ check-map-layer-names: ${toggles} toggles de camada em ${files.length} ficheiros — todos com nome constante (nome=modo)`,
  );
}

module.exports = { collectFiles, MIN_FILES, MIN_TOGGLES };

if (require.main === module) main();
