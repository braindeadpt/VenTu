#!/usr/bin/env node
'use strict';

/**
 * Resolve what the Deploy workflow should publish (opção B — separar código de
 * dados).
 *
 * Runs in the build job BEFORE any build step. It answers one question: which
 * commit's CODE should ship, and which commit's DATA should be laid over it?
 *
 * The decision itself lives in scripts/lib/deploySource.js (pure, unit-tested).
 * This script does the I/O the pure module cannot:
 *   - reads main's SHA from the checkout;
 *   - asks the GitHub API for the recent CI runs on main;
 *   - validates the candidate (event ≠ pull_request, SHA is an ancestor of
 *     main) — a green PR run says nothing about main;
 *   - measures the lag (commits and hours) between the green base and main;
 *   - writes the verdict to $GITHUB_OUTPUT and a human summary to
 *     $GITHUB_STEP_SUMMARY.
 *
 * It does NOT move git refs. The workflow does the two safe checkouts with the
 * SHAs emitted here (`git checkout --detach <green>` + `git checkout <main> --
 * public/data`). Never `checkout -f -B main` — on 2026-09-22 that moved the
 * shared main reference and detonated every other worktree.
 *
 * Failure policy: if there is no acceptable green run in the window (or the
 * API is unreachable), the script fails LOUDLY (exit 1). Option B must never
 * publish on a guess — a red-CI window that outlasts the window is an incident,
 * not a reason to ship unknown code.
 *
 * What is overlaid and why only public/data: the site is a static export and
 * the SSG reads public/data at BUILD time (scores baked into the served HTML,
 * OG images, SEO). So fresh data must be in place before `next build`, not
 * copied onto a finished site. data-state/ is deliberately NOT overlaid: the
 * static build and scripts/validate-data-files.js never read it (it is
 * pipeline scratch — archives the bots also commit), so carrying it over would
 * only risk incoherence. Confirmed by grep: no reference under src/, and
 * validate-data-files.js walks public/data only.
 *
 * Manual `workflow_dispatch` stays ungated (human decision): code = the chosen
 * commit, no overlay.
 *
 * Usage (in CI):
 *   GH_TOKEN=... GITHUB_EVENT_NAME=workflow_run node scripts/resolve-deploy-source.js
 * Local dry check (no writes to GITHUB_OUTPUT/S):
 *   GITHUB_EVENT_NAME=workflow_dispatch node scripts/resolve-deploy-source.js
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const {
  GREEN_RUN_MAX_AGE_DAYS_DEFAULT,
  LAG_WARN_COMMITS_DEFAULT,
  LAG_WARN_HOURS_DEFAULT,
  pickGreenRun,
  evaluateDeploySource,
  formatDeploySummary,
} = require('./lib/deploySource');

const REPO = process.env.GITHUB_REPOSITORY || 'braindeadpt/VenTu';
const CI_WORKFLOW_FILE = process.env.VENTU_CI_WORKFLOW_FILE || 'ci.yml';
const EVENT = process.env.GITHUB_EVENT_NAME || 'workflow_dispatch';
const DRY_RUN = process.env.VENTU_DRY_RUN === '1' || process.env.VENTU_DRY_RUN === 'true';

const maxAgeDays = Number(process.env.VENTU_GREEN_RUN_MAX_AGE_DAYS) || GREEN_RUN_MAX_AGE_DAYS_DEFAULT;
const lagWarnCommits = Number(process.env.VENTU_LAG_WARN_COMMITS) || LAG_WARN_COMMITS_DEFAULT;
const lagWarnHours = Number(process.env.VENTU_LAG_WARN_HOURS) || LAG_WARN_HOURS_DEFAULT;

const short = (sha) => (sha ? String(sha).slice(0, 9) : '—');

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf-8' }).trim();
}

function gitTry(...args) {
  try {
    return git(...args);
  } catch {
    return null;
  }
}

function ghApi(path, jq) {
  try {
    const out = execFileSync(
      'gh',
      ['api', path, '--jq', jq],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
    return out;
  } catch (e) {
    console.error(`⚠️ gh api falhou (${path}): ${e.message || e}`);
    return null;
  }
}

function writeOutputs(pairs) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) {
    console.log('ℹ️ GITHUB_OUTPUT ausente — outputs:');
    for (const [k, v] of Object.entries(pairs)) console.log(`   ${k}=${v}`);
    return;
  }
  let buf = '';
  for (const [k, v] of Object.entries(pairs)) buf += `${k}=${v}\n`;
  fs.appendFileSync(out, buf);
}

function writeSummary(md) {
  const out = process.env.GITHUB_STEP_SUMMARY;
  if (!out) return;
  fs.appendFileSync(out, `${md}\n`);
}

/** Recent completed CI runs on main, normalized to the shape deploySource uses. */
function fetchCiRuns() {
  const jq =
    '[.workflow_runs[] | {conclusion, event, head_sha, created_at, html_url, run_number}]';
  const raw = ghApi(
    `repos/${REPO}/actions/workflows/${CI_WORKFLOW_FILE}/runs?branch=main&status=completed&per_page=50`,
    jq,
  );
  if (!raw) return null;
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : null;
  } catch (e) {
    console.error(`⚠️ resposta do API não é JSON: ${e.message}`);
    return null;
  }
}

/** Hours since the green commit landed (the age of the code base). */
function greenCommitAgeHours(greenSha, nowMs) {
  const iso = gitTry('show', '-s', '--format=%cI', greenSha);
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (nowMs - t) / 3600000);
}

function finish(res, greenRun) {
  const md = formatDeploySummary(res, { greenRun, dryRun: DRY_RUN });
  writeSummary(md);

  // needs_checkout: only the overlay path re-checks out; manual dispatch runs on
  // the ref the human picked.
  writeOutputs({
    mode: res.status,
    code_sha: res.codeSha || '',
    data_sha: res.dataSha || '',
    needs_checkout: res.status === 'ok' ? 'true' : 'false',
    warn: res.warn ? 'true' : 'false',
  });

  console.log(md);

  if (res.warn && res.warnReason) {
    console.log(`::warning::Deploy: ${res.warnReason}`);
  }

  if (res.status === 'fail') {
    console.log(`::error::Deploy recusado — ${res.reason}`);
    process.exit(1);
  }
  process.exit(0);
}

function main() {
  const nowMs = Date.now();
  const mainSha = gitTry('rev-parse', 'HEAD');
  if (!mainSha) {
    console.log('::error::não foi possível resolver o HEAD do checkout');
    process.exit(1);
  }

  if (EVENT !== 'workflow_run') {
    const res = evaluateDeploySource({
      mode: 'workflow_dispatch',
      mainSha,
      lagWarnCommits,
      lagWarnHours,
    });
    finish(res, null);
    return;
  }

  const runs = fetchCiRuns();
  const greenRun = runs ? pickGreenRun(runs, { nowMs, maxAgeDays }) : null;

  let greenIsAncestor = false;
  let lagCommits = null;
  let lagHours = null;

  if (greenRun) {
    greenIsAncestor = gitTry('merge-base', '--is-ancestor', greenRun.head_sha, mainSha) !== null;
    if (greenIsAncestor) {
      const count = gitTry('rev-list', '--count', `${greenRun.head_sha}..${mainSha}`);
      lagCommits = count === null ? null : Number(count);
      if (!Number.isFinite(lagCommits)) lagCommits = null;
      // No drift → lag 0 (don't report the age of a commit that IS main).
      lagHours = lagCommits === 0 ? 0 : greenCommitAgeHours(greenRun.head_sha, nowMs);
    }
  }

  const res = evaluateDeploySource({
    mode: 'workflow_run',
    mainSha,
    greenRun,
    greenIsAncestor,
    lagCommits,
    lagHours,
    lagWarnCommits,
    lagWarnHours,
  });

  console.log(
    `CI runs analisados: ${runs ? runs.length : 'indisponível'} · verde escolhido: ${short(
      greenRun && greenRun.head_sha,
    )} (${greenRun ? greenRun.created_at : '—'}) · main: ${short(mainSha)}`,
  );

  finish(res, greenRun);
}

main();
