'use strict';

/**
 * Deploy source resolution (workflow deploy.yml — opção B, separar código de
 * dados).
 *
 * The problem this module exists to solve: data workflows run every ~30 min
 * and push to main WITHOUT triggering CI (public/data/** is in paths-ignore),
 * so a deploy triggered by them publishes whatever code main happens to carry
 * — including a red-CI commit. The old gate ("CI vermelho ⇒ sem deploy") only
 * held for the push → CI path, which is now the minority of triggers.
 *
 * Option B separates the two: publish the DATA from main over the CODE of the
 * last commit whose CI run was green. Fresh conditions keep flowing to users
 * even while CI is red; broken code never reaches production.
 *
 * This module is pure (no fs/git/network): it takes already-resolved facts and
 * decides. scripts/resolve-deploy-source.js does the git/gh I/O and feeds it
 * here; scripts/lib/__tests__/deploySource.test.js covers the decisions. That
 * split is deliberate — the workflow cannot be exercised safely in production,
 * so the decision logic must be testable without running it.
 *
 * Two invariants the caller (and the workflow) must respect:
 *   1. The green run must NOT be a pull_request run. A green CI on a PR says
 *      nothing about main.
 *   2. The green SHA must be an ancestor of main. A run from a divergent or
 *      unreachable branch is not a valid base for main's data.
 *
 * See also: OVERLAY_PATHS (what travels over the green code) and the comment
 * on data-state in resolve-deploy-source.js — data-state/ is NOT overlaid
 * because neither the static build nor the data validators read it.
 */

/** Paths taken from main and laid over the green-code tree before the build.
 *  public/data is the product (SSG reads it at build time, so it MUST be in
 *  place before `next build` — copying it onto an already-built site would
 *  leave the served HTML/OG/SEO with the green commit's scores). */
const OVERLAY_PATHS = Object.freeze(['public/data']);

/** A green CI run older than this is not a credible base for production. */
const GREEN_RUN_MAX_AGE_DAYS_DEFAULT = 7;

/** Warn (not fail) once the green code lags main by more than these. Both are
 *  independent tripwires: a fast-cadence pipeline moves many commits in a few
 *  hours, and a quiet week moves few but ages a lot. */
const LAG_WARN_COMMITS_DEFAULT = 25;
const LAG_WARN_HOURS_DEFAULT = 48;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Is this CI run a usable base for production?
 *
 * @param {object|null|undefined} run a workflow run
 *   `{ conclusion, event, head_sha, created_at, html_url, run_number }`
 * @param {{ nowMs?: number; maxAgeDays?: number }} [opts]
 * @returns {boolean}
 */
function isAcceptableGreenRun(run, opts = {}) {
  if (!run || typeof run !== 'object') return false;
  if (run.conclusion !== 'success') return false;
  if (run.event === 'pull_request') return false;
  if (typeof run.head_sha !== 'string' || run.head_sha.length === 0) return false;
  const nowMs = opts.nowMs ?? Date.now();
  const maxAgeDays = opts.maxAgeDays ?? GREEN_RUN_MAX_AGE_DAYS_DEFAULT;
  const createdMs = new Date(run.created_at).getTime();
  if (!Number.isFinite(createdMs)) return false;
  return nowMs - createdMs <= maxAgeDays * DAY_MS;
}

/**
 * Newest acceptable green run, or null. `runs` may be in any order.
 *
 * @param {Array<object>} runs
 * @param {{ nowMs?: number; maxAgeDays?: number }} [opts]
 * @returns {object|null}
 */
function pickGreenRun(runs, opts = {}) {
  const acceptable = (Array.isArray(runs) ? runs : []).filter((r) =>
    isAcceptableGreenRun(r, opts),
  );
  if (acceptable.length === 0) return null;
  acceptable.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return acceptable[0];
}

/**
 * Decide what the deploy publishes and whether it is warned/allowed.
 *
 * @param {{
 *   mode: 'workflow_run' | 'workflow_dispatch';
 *   mainSha: string;
 *   greenRun?: object|null;
 *   greenIsAncestor?: boolean;
 *   lagCommits?: number;
 *   lagHours?: number;
 *   greenCommitAt?: string|null;
 *   lagWarnCommits?: number;
 *   lagWarnHours?: number;
 * }} input
 * @returns {{
 *   status: 'ok' | 'fail' | 'manual';
 *   reason: string;
 *   codeSha: string;
 *   dataSha: string;
 *   overlayPaths: string[];
 *   lagCommits: number|null;
 *   lagHours: number|null;
 *   warn: boolean;
 *   warnReason: string|null;
 * }}
 */
function evaluateDeploySource(input) {
  const {
    mode,
    mainSha,
    greenRun = null,
    greenIsAncestor = false,
    lagCommits = null,
    lagHours = null,
    lagWarnCommits = LAG_WARN_COMMITS_DEFAULT,
    lagWarnHours = LAG_WARN_HOURS_DEFAULT,
  } = input;

  // Manual dispatch = explicit human decision, no gate (unchanged behaviour):
  // publish exactly the commit that was selected, no data overlay.
  if (mode === 'workflow_dispatch') {
    return {
      status: 'manual',
      reason: 'workflow_dispatch — decisão humana explícita, sem portão',
      codeSha: mainSha,
      dataSha: mainSha,
      overlayPaths: [],
      lagCommits: null,
      lagHours: null,
      warn: false,
      warnReason: null,
    };
  }

  if (!greenRun) {
    return {
      status: 'fail',
      reason:
        'nenhum run verde do CI em main dentro da janela — recusar publicar às escuras',
      codeSha: null,
      dataSha: mainSha,
      overlayPaths: [],
      lagCommits: null,
      lagHours: null,
      warn: false,
      warnReason: null,
    };
  }

  if (!greenIsAncestor) {
    return {
      status: 'fail',
      reason: `SHA verde ${String(greenRun.head_sha).slice(0, 9)} não é antepassado de main — base inválida`,
      codeSha: null,
      dataSha: mainSha,
      overlayPaths: [],
      lagCommits: null,
      lagHours: null,
      warn: false,
      warnReason: null,
    };
  }

  const reasons = [];
  if (Number.isFinite(lagCommits) && lagCommits > lagWarnCommits) {
    reasons.push(`${lagCommits} commits`);
  }
  if (Number.isFinite(lagHours) && lagHours > lagWarnHours) {
    reasons.push(`${lagHours.toFixed(1)} h`);
  }

  return {
    status: 'ok',
    reason: `código do CI verde ${String(greenRun.head_sha).slice(0, 9)} + dados de main`,
    codeSha: greenRun.head_sha,
    dataSha: mainSha,
    overlayPaths: [...OVERLAY_PATHS],
    lagCommits: Number.isFinite(lagCommits) ? lagCommits : null,
    lagHours: Number.isFinite(lagHours) ? lagHours : null,
    warn: reasons.length > 0,
    warnReason:
      reasons.length > 0
        ? `código atrás de main há ${reasons.join(' / ')} — CI vermelho prolongado?`
        : null,
  };
}

/**
 * Markdown job summary. Always written (success or failure) so the lag is
 * never invisible — the failure mode of option B is production staying green
 * and fresh while the CODE silently stalls on an old commit.
 *
 * @param {ReturnType<typeof evaluateDeploySource>} res
 * @param {{ greenRun?: object|null; mainSha?: string; dryRun?: boolean; generatedAt?: string }} [ctx]
 * @returns {string}
 */
function formatDeploySummary(res, ctx = {}) {
  const { greenRun = null, dryRun = false, generatedAt = new Date().toISOString() } = ctx;
  const short = (sha) => (sha ? String(sha).slice(0, 9) : '—');
  const lines = [
    '## Deploy source (código verde + dados frescos)',
    '',
    `- **estado:** ${res.status}${dryRun ? ' (dry_run — não publica)' : ''}`,
    `- **código:** \`${short(res.codeSha)}\`${
      greenRun
        ? ` (CI verde a ${greenRun.created_at}${greenRun.run_number ? `, run #${greenRun.run_number}` : ''})`
        : ''
    }`,
    `- **dados:** \`${short(res.dataSha)}\``,
    `- **atraso:** ${
      res.lagCommits === null && res.lagHours === null
        ? '—'
        : `${res.lagCommits ?? '—'} commits / ${
            res.lagHours === null ? '—' : `${res.lagHours.toFixed(1)} h`
          }`
    }`,
    `- **sobreposição:** ${res.overlayPaths.length ? res.overlayPaths.map((p) => `\`${p}\``).join(', ') : 'nenhuma'}`,
    `- **razão:** ${res.reason}`,
  ];
  if (res.warn && res.warnReason) {
    lines.push('', `> ⚠️ ${res.warnReason}`);
  }
  if (greenRun && greenRun.html_url) {
    lines.push('', `Run verde: ${greenRun.html_url}`);
  }
  lines.push('', `_Gerado em ${generatedAt} por scripts/resolve-deploy-source.js_`);
  return lines.join('\n');
}

module.exports = {
  OVERLAY_PATHS,
  GREEN_RUN_MAX_AGE_DAYS_DEFAULT,
  LAG_WARN_COMMITS_DEFAULT,
  LAG_WARN_HOURS_DEFAULT,
  isAcceptableGreenRun,
  pickGreenRun,
  evaluateDeploySource,
  formatDeploySummary,
};
