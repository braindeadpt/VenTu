#!/usr/bin/env node
'use strict';

/**
 * Precheck barato do deploy (job `precheck` do deploy.yml).
 *
 * Porquê existe (#455): cada `workflow_run` concluído com sucesso acordava
 * um job `build` que clonava ~1.8 GiB (`fetch-depth: 0`) antes do
 * resolve-deploy-source decidir `skip=true` — e a cascata acontecia 2× a
 * cada ~30 min (Update VenTu Data + Dawn Patrol). Este job responde à
 * pergunta «o que se publicaria já é o que está no live?» via API do GitHub
 * (sem checkout pesado), em segundos.
 *
 * Contrato de segurança: `proceed=false` SÓ quando a impressão digital do
 * que o resolver publicaria é idêntica à do manifesto live e a resolução
 * seria `ok`. Qualquer dúvida — API em baixo, run verde ausente, ancestral
 * não provável, manifesto velho — emite `proceed=true` e o job `build`
 * corre o resolve-deploy-source completo (é ele quem decide e quem falha
 * com barulho). O precheck nunca recusa um deploy; só salta clones iguais.
 *
 * A lógica de decisão é a MESMA do resolver: `pickGreenRun`,
 * `evaluateDeploySource`, `computeDeployFingerprint` e `decideDeploySkip`
 * vivem em scripts/lib/deploySource.js (puro, com testes). O que muda é a
 * fonte dos factos: `gh api` em vez de git local.
 *
 * Uso (CI):
 *   GITHUB_EVENT_NAME=workflow_run GH_TOKEN=... node scripts/deploy-precheck.js
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const {
  DEPLOY_SOURCE_LIVE_URL_DEFAULT,
  DEPLOY_SKIP_MAX_AGE_HOURS_DEFAULT,
  computeDeployFingerprint,
  decideDeploySkip,
  GREEN_RUN_MAX_AGE_DAYS_DEFAULT,
  pickGreenRun,
  evaluateDeploySource,
} = require('./lib/deploySource');

const REPO = process.env.GITHUB_REPOSITORY || 'braindeadpt/VenTu';
const CI_WORKFLOW_FILE = process.env.VENTU_CI_WORKFLOW_FILE || 'ci.yml';
const EVENT = process.env.GITHUB_EVENT_NAME || 'workflow_dispatch';

const maxAgeDays = Number(process.env.VENTU_GREEN_RUN_MAX_AGE_DAYS) || GREEN_RUN_MAX_AGE_DAYS_DEFAULT;

const short = (sha) => (sha ? String(sha).slice(0, 9) : '—');

function ghApi(path, jq) {
  try {
    const out = execFileSync('gh', ['api', path, '--jq', jq], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return out;
  } catch (e) {
    console.error(`⚠️ gh api falhou (${path}): ${e.message || e}`);
    return null;
  }
}

function ghApiJson(path) {
  const raw = ghApi(path, '.');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Recent completed CI runs on main — a mesma query do resolver. */
function fetchCiRuns() {
  const list = ghApiJson(
    `repos/${REPO}/actions/workflows/${CI_WORKFLOW_FILE}/runs?branch=main&status=success&per_page=50`,
  );
  const runs = list && list.workflow_runs;
  if (!Array.isArray(runs)) return null;
  return runs.map((r) => ({
    conclusion: r.conclusion,
    event: r.event,
    head_sha: r.head_sha,
    created_at: r.created_at,
    html_url: r.html_url,
    run_number: r.run_number,
  }));
}

/** Manifesto publicado em produção (a mesma fonte do resolver). */
async function fetchLiveManifest() {
  const url = process.env.VENTU_DEPLOY_SOURCE_URL || DEPLOY_SOURCE_LIVE_URL_DEFAULT;
  try {
    const r = await fetch(`${url}?t=${Date.now()}`, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      console.log(`ℹ️ manifesto do live: HTTP ${r.status}`);
      return null;
    }
    return await r.json();
  } catch (e) {
    console.log(`ℹ️ manifesto do live indisponível: ${e.message || e}`);
    return null;
  }
}

/** Ancestralidade + atraso do verde face a main, sem git local.
 *  `compare base...head`: `status` behind/identical ⇒ base é antepassado. */
function compareGreenToMain(greenSha, mainSha) {
  const cmp = ghApiJson(`repos/${REPO}/compare/${greenSha}...${mainSha}`);
  if (!cmp || typeof cmp.status !== 'string') return null;
  const files = Array.isArray(cmp.files) ? cmp.files.map((f) => f.filename) : null;
  return {
    isAncestor: cmp.status === 'behind' || cmp.status === 'identical',
    // ahead_by = commits que main tem e o verde não — o «atraso» do resolver.
    lagCommits: Number.isFinite(cmp.ahead_by) ? cmp.ahead_by : null,
    // A API limita a lista a 300 ficheiros — sem ela completa não dá para
    // provar «diff só de dados»; devolve null nesse caso.
    diffFiles: files && files.length < 300 ? files : null,
  };
}

/** Horas desde o commit verde (committer date — `%cI` do resolver). */
function greenCommitAgeHours(greenSha, nowMs) {
  const iso = ghApi(`repos/${REPO}/commits/${greenSha}`, '.commit.committer.date');
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? Math.max(0, (nowMs - t) / 3600000) : null;
}

/** Árvore do commit (o `^{tree}` do resolver, via git/commits). */
function commitTree(sha) {
  return ghApi(`repos/${REPO}/git/commits/${sha}`, '.tree.sha');
}

/** Sub-árvore `public/data` do commit de dados: root → public → data. */
function dataTree(dataSha) {
  const root = commitTree(dataSha);
  if (!root) return null;
  const publicSha = ghApi(`repos/${REPO}/git/trees/${root}`, '.tree[] | select(.path=="public") | .sha');
  if (!publicSha) return null;
  return ghApi(`repos/${REPO}/git/trees/${publicSha}`, '.tree[] | select(.path=="data") | .sha');
}

/** Blob sha do deploy.yml na ponta de main (o `rev-parse main:file` do resolver). */
function workflowBlob(mainSha) {
  return ghApi(
    `repos/${REPO}/contents/.github/workflows/deploy.yml?ref=${mainSha}`,
    '.sha',
  );
}

function emit(proceed, reason) {
  console.log(`precheck: ${reason}`);
  console.log(`proceed=${proceed ? 'true' : 'false'}`);
  const out = process.env.GITHUB_OUTPUT;
  if (out) fs.appendFileSync(out, `proceed=${proceed ? 'true' : 'false'}\n`);
}

async function main() {
  // workflow_dispatch nunca salta (decisão humana) — o resolver decide-se
  // dentro do build, como dantes.
  if (EVENT !== 'workflow_run') {
    emit(true, 'workflow_dispatch — resolver decide dentro do build');
    return;
  }

  const nowMs = Date.now();
  const mainSha = ghApi(`repos/${REPO}/commits/main`, '.sha');
  if (!mainSha) {
    emit(true, 'sha de main indisponível — resolver decide');
    return;
  }
  // Os dados vivem na branch órfão ventu-data (mesma fonte do resolver).
  const dataSha = ghApi(`repos/${REPO}/commits/ventu-data`, '.sha') || mainSha;

  const runs = fetchCiRuns();
  // Uma só página chega para o precheck: se o índice esconder um verde novo,
  // a pior consequência é saltar um deploy que o próximo gatilho (≤ ~30 min)
  // publica — e só quando a impressão digital coincide com o live, ou seja,
  // o que já está publicado nem sequer mudaria.
  const greenRun = pickGreenRun(runs, { nowMs, ignoreMaxAge: true });
  if (!greenRun) {
    emit(true, 'sem run verde visível — resolver decide (fail-safe)');
    return;
  }

  const cmp = compareGreenToMain(greenRun.head_sha, mainSha);
  if (!cmp) {
    emit(true, 'compare API indisponível — resolver decide');
    return;
  }

  const lagCommits = cmp.lagCommits;
  const lagHours = lagCommits === null ? null
    : lagCommits === 0 ? 0 : greenCommitAgeHours(greenRun.head_sha, nowMs);

  // Verde fora da janela: o resolver aceita-o só quando o diff até main é
  // todo public/data/. Reproduz a prova com os ficheiros do compare.
  let greenAgeDays = null;
  let staleGreenDataOnly = false;
  let staleNonDataPath = null;
  const createdMs = new Date(greenRun.created_at).getTime();
  if (Number.isFinite(createdMs)) greenAgeDays = (nowMs - createdMs) / 86400000;
  if (greenAgeDays !== null && greenAgeDays > maxAgeDays) {
    if (cmp.diffFiles) {
      staleGreenDataOnly = cmp.diffFiles.every((f) => f.startsWith('public/data/'));
      staleNonDataPath = cmp.diffFiles.find((f) => !f.startsWith('public/data/')) ?? null;
    }
    // diffFiles null (cap de 300) → não provável → fica false → status fail
    // → proceed: o resolver refaz a prova com o clone completo.
  }

  const res = evaluateDeploySource({
    mode: 'workflow_run',
    mainSha,
    greenRun,
    greenIsAncestor: cmp.isAncestor,
    lagCommits,
    lagHours,
    greenAgeDays,
    staleGreenDataOnly,
    staleNonDataPath,
    maxAgeDays,
  });

  if (res.status !== 'ok') {
    // fail → o resolver é quem grita (a recusa é um sinal, não um desperdício).
    emit(true, `resolução seria '${res.status}' — resolver decide`);
    return;
  }

  const fingerprint = computeDeployFingerprint({
    codeTree: commitTree(res.codeSha),
    dataTree: dataTree(dataSha),
    workflowBlob: workflowBlob(mainSha),
  });
  if (!fingerprint) {
    emit(true, 'impressão digital incompleta via API — resolver decide');
    return;
  }

  const liveManifest = await fetchLiveManifest();
  const d = decideDeploySkip({
    mode: 'workflow_run',
    status: res.status,
    fingerprint,
    liveManifest,
    nowMs,
    maxAgeHours: Number(process.env.VENTU_DEPLOY_SKIP_MAX_AGE_HOURS) || DEPLOY_SKIP_MAX_AGE_HOURS_DEFAULT,
  });

  if (d.skip) {
    console.log(`::notice::Deploy saltado no precheck — ${d.reason} (clone de ~1.8 GiB poupado)`);
    emit(false, `${d.reason} — fingerprint ${short(fingerprint)}`);
  } else {
    emit(true, `${d.reason} (verde ${short(greenRun.head_sha)} · dados ${short(dataSha)})`);
  }
}

main().catch((e) => {
  // Fail-open: qualquer erro aqui NÃO pode saltar um deploy necessário.
  console.error(`⚠️ precheck falhou (${e.message || e}) — resolver decide`);
  emit(true, `erro no precheck — resolver decide`);
});
