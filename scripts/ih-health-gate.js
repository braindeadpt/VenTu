#!/usr/bin/env node
/**
 * VenTu — Gate do `ih-health.yml` (workflow IH Tide Health Monitor).
 *
 * Decide, num ping do keep-alive externo, se este run deve sondar o backend de
 * marés do IH e o produto radar do IPMA. Um ping acorda TODOS os workflows que
 * declaram `repository_dispatch(ping)` (docs/EXTERNAL-KEEPALIVE.md): nos
 * outros é barato (ler um ficheiro / chamar a API de commits), aqui são duas
 * sondagens HTTP a terceiros que, num sistema saudável, só duplicam o
 * `schedule` horário deste monitor e a sondagem de radar do
 * `data-cadence-alert` (cada 30 min). O racional e a matriz de decisão vivem em
 * `scripts/lib/ihHealthGate.js` (puro, com testes).
 *
 * Fontes de verdade (nenhuma inventa estado):
 *  - `public/data/pipeline-meta.json` do checkout (o pipeline commita-o em cada
 *    run) → idade do full/obs, com os limiares dos heartbeats (3 h dia / 5 h noite);
 *  - último commit de `public/data/**` via API de commits do GitHub (mesma
 *    medição do `check-data-cadence.js`);
 *  - issues abertas com as labels `ih-outage` / `ipma-radar-outage` — sem este
 *    sinal o gate fecharia a sonda e a recuperação nunca seria detectada, com a
 *    issue aberta para sempre.
 *
 * Escreve `probe=true|false` (e `reason=`) em `$GITHUB_OUTPUT` para o workflow
 * decidir os `if:` dos passos de sonda. Exit 0 sempre: um gate partido não pode
 * transformar o monitor num gerador de runs vermelhos — e, ao contrário dos
 * monitores, um erro inesperado ABRE a sonda (fail-open): duplicar uma sondagem
 * é barato, ficar cego durante uma outage não é.
 *
 * Usage:
 *   GITHUB_EVENT_NAME=repository_dispatch node scripts/ih-health-gate.js
 *   IH_HEALTH_FORCE=1 node scripts/ih-health-gate.js          # sonda sempre
 *   PIPELINE_META_ROOT=... node scripts/ih-health-gate.js     # testes
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const { GATED_TRIGGERS, evaluateIhHealthGate } = require('./lib/ihHealthGate');
const { readPipelineMeta } = require('./lib/pipelineMeta');

const REPO = process.env.GITHUB_REPOSITORY || 'braindeadpt/VenTu';
const DATA_PATH = 'public/data';
const IH_OUTAGE_LABEL = process.env.IH_OUTAGE_LABEL || 'ih-outage';
const RADAR_OUTAGE_LABEL = process.env.RADAR_OUTAGE_LABEL || 'ipma-radar-outage';

function gh(...args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/**
 * Idade (ms) do último commit que toca `public/data/**`, ou null se a API não
 * responder. Mesma medição do check-data-cadence.js: o committer date é a
 * verdade observável, não os timestamps internos dos ficheiros.
 * @returns {number | null}
 */
function lastDataCommitAt() {
  const out = gh(
    'api', `repos/${REPO}/commits?path=${DATA_PATH}&per_page=1`,
    '--jq', '.[0].commit.committer.date',
  );
  if (!out) return null;
  const t = new Date(out).getTime();
  return Number.isFinite(t) ? t : null;
}

/** @param {string} label @returns {boolean} */
function hasOpenIssue(label) {
  const out = gh(
    'issue', 'list', '--repo', REPO, '--label', label, '--state', 'open',
    '--json', 'number', '--jq', 'length',
  );
  if (out === null) return false;
  const n = Number(out);
  return Number.isFinite(n) && n > 0;
}

function main() {
  const eventName = process.env.GITHUB_EVENT_NAME || '';
  const force = process.env.IH_HEALTH_FORCE === '1';

  // Só o caminho gateado precisa do sinal do commit: no schedule a decisão é
  // sempre sondar, por isso não se gasta uma chamada à API de hora a hora.
  let lastCommitAtMs = null;
  if (GATED_TRIGGERS.includes(eventName) && !force) {
    lastCommitAtMs = lastDataCommitAt();
  }

  const openIncidents = hasOpenIssue(IH_OUTAGE_LABEL) || hasOpenIssue(RADAR_OUTAGE_LABEL);

  const decision = evaluateIhHealthGate({
    eventName,
    // PIPELINE_META_ROOT permite apontar o gate a outro checkout (testes).
    meta: readPipelineMeta(process.env.PIPELINE_META_ROOT),
    lastCommitAtMs,
    openIncidents,
    force,
  });

  console.log(`ih-health gate: trigger="${eventName || 'desconhecido'}" → probe=${decision.probe}`);
  console.log(`  ${decision.probe ? '🔎' : '⏭️'}  ${decision.reason}`);
  if (decision.signals.length > 0) console.log(`  sinais: ${decision.signals.join(', ')}`);

  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    fs.appendFileSync(out, `probe=${decision.probe}\n`);
    fs.appendFileSync(out, `reason=${decision.reason.replace(/\n/g, ' ')}\n`);
  }

  // Resumo do run: um ping que não sonda tem de explicar-se na página do run
  // (senão «as sondagens não correram» vira mistério).
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    fs.appendFileSync(
      summary,
      `### ih-health gate — ${decision.probe ? 'sonda IH/IPMA' : 'sonda saltada'}\n\n` +
        `- trigger: \`${eventName || 'desconhecido'}\`\n` +
        `- ${decision.reason}\n` +
        (decision.signals.length > 0 ? `- sinais: ${decision.signals.join(', ')}\n` : ''),
    );
  }

  process.exit(0);
}

try {
  main();
} catch (e) {
  // Fail-open: um gate que rebenta sonda (ver o cabeçalho).
  console.error(`⚠️ ih-health gate falhou (${e.message || e}) — a sondar por precaução`);
  const out = process.env.GITHUB_OUTPUT;
  if (out) fs.appendFileSync(out, 'probe=true\nreason=gate error — fail-open\n');
  process.exit(0);
}
