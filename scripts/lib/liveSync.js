'use strict';

/**
 * Live-sync heartbeat — o pipeline pode estar vivo na main e a produção
 * parada atrás dele.
 *
 * Os dois monitores de dados (check-pipeline-staleness.js e
 * check-data-cadence.js) medem a MAIN: timestamps do pipeline-meta.json do
 * checkout e o último commit que o toca. Nenhum deles vê o que o utilizador
 * vê. Se o deploy pára (run do Pages preso em `waiting`/`queued`, deploy a
 * falhar, resolução do código verde a recusar), a main continua fresca, os
 * dois monitores dizem «OK» e ventu.surf serve dados com horas.
 *
 * Este módulo compara o `lastRunAt` do pipeline-meta.json da main com o de
 * https://ventu.surf/data/pipeline-meta.json e olha para os runs do deploy.yml
 * por arrancar:
 *   - live atrasado: a main tem um run mais novo do que o live há > 60 min
 *     (um deploy normal demora 15–25 min depois do commit de dados);
 *   - deploy preso: um run do deploy.yml em `waiting`/`queued`/`pending` há
 *     > 60 min.
 *
 * A decisão é pura (evaluateLiveSync); a I/O (fetch do live, gh api) está em
 * funções separadas com dependências injectáveis, para os testes.
 * Falha de I/O nunca fabrica um incidente: live inalcançável ⇒ `unknown`.
 */

const LIVE_META_URL_DEFAULT = 'https://ventu.surf/data/pipeline-meta.json';
const LIVE_SYNC_MAX_LAG_MIN_DEFAULT = 60;
const DEPLOY_STUCK_MAX_MIN_DEFAULT = 60;
/** `pending` = retido pela concurrency `pages` (cancel-in-progress: false). */
const PENDING_DEPLOY_STATUSES = Object.freeze(['waiting', 'queued', 'pending']);

function tsMs(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * @param {{
 *   mainMeta?: object | null;
 *   liveMeta?: object | null;
 *   liveOk?: boolean;
 *   pendingDeploys?: Array<{ status?: string; created_at?: string; html_url?: string; id?: number }> | null;
 *   nowMs?: number;
 *   maxLagMin?: number;
 *   stuckMaxMin?: number;
 * }} input
 * @returns {{
 *   behind: boolean;
 *   unknown: boolean;
 *   liveBehind: boolean;
 *   mainLastRunAt: string | null;
 *   liveLastRunAt: string | null;
 *   lagMinutes: number | null;
 *   stuckDeploys: Array<{ status: string; ageMinutes: number; html_url: string | null }>;
 *   reasons: string[];
 * }}
 */
function evaluateLiveSync(input = {}) {
  const nowMs = input.nowMs ?? Date.now();
  const maxLagMin = input.maxLagMin ?? LIVE_SYNC_MAX_LAG_MIN_DEFAULT;
  const stuckMaxMin = input.stuckMaxMin ?? DEPLOY_STUCK_MAX_MIN_DEFAULT;
  const mainLastRunAt = input.mainMeta?.lastRunAt ?? null;
  const liveLastRunAt = input.liveMeta?.lastRunAt ?? null;
  const mainMs = tsMs(mainLastRunAt);
  const liveMs = tsMs(liveLastRunAt);
  const liveOk = input.liveOk !== false && input.liveMeta != null;

  const reasons = [];
  let liveBehind = false;
  let lagMinutes = null;
  // Sem lastRunAt na main não há termo de comparação (o staleness cobre).
  if (liveOk && mainMs != null && (liveMs == null || mainMs > liveMs)) {
    lagMinutes = Math.max(0, (nowMs - mainMs) / 60000);
    if (lagMinutes > maxLagMin) {
      liveBehind = true;
      reasons.push(
        `o run de ${mainLastRunAt} da main não chegou a ventu.surf há ${Math.round(lagMinutes)} min (live: ${liveLastRunAt || '—'})`,
      );
    }
  } else if (liveOk && mainMs != null) {
    lagMinutes = 0;
  }

  const stuckDeploys = [];
  for (const r of Array.isArray(input.pendingDeploys) ? input.pendingDeploys : []) {
    if (!r || !PENDING_DEPLOY_STATUSES.includes(r.status)) continue;
    const c = tsMs(r.created_at);
    if (c == null) continue;
    const ageMinutes = (nowMs - c) / 60000;
    if (ageMinutes > stuckMaxMin) {
      stuckDeploys.push({ status: r.status, ageMinutes, html_url: r.html_url || null });
    }
  }
  for (const d of stuckDeploys) {
    reasons.push(`deploy em \`${d.status}\` há ${Math.round(d.ageMinutes)} min${d.html_url ? ` (${d.html_url})` : ''}`);
  }

  return {
    behind: liveBehind || stuckDeploys.length > 0,
    unknown: !liveOk,
    liveBehind,
    mainLastRunAt,
    liveLastRunAt,
    lagMinutes,
    stuckDeploys,
    reasons,
  };
}

/**
 * pipeline-meta.json do live. Cache-buster na query: o CDN do Pages serve
 * `max-age=600`, e um meta em cache de 10 min não pode passar por atraso.
 * @param {{ url?: string; fetchImpl?: typeof fetch; nowMs?: number; timeoutMs?: number }} [opts]
 * @returns {Promise<{ ok: boolean; meta: object | null; error?: string }>}
 */
async function fetchLiveMeta(opts = {}) {
  const url = opts.url || process.env.LIVE_META_URL || LIVE_META_URL_DEFAULT;
  const fetchImpl = opts.fetchImpl || fetch;
  const sep = url.includes('?') ? '&' : '?';
  try {
    const res = await fetchImpl(`${url}${sep}t=${opts.nowMs ?? Date.now()}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'VenTu-Bot/1.0 (+https://ventu.surf)', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
    });
    if (!res.ok) return { ok: false, meta: null, error: `HTTP ${res.status}` };
    const meta = await res.json();
    return { ok: Boolean(meta && typeof meta === 'object'), meta: meta && typeof meta === 'object' ? meta : null };
  } catch (e) {
    return { ok: false, meta: null, error: String((e && e.message) || e) };
  }
}

/**
 * Runs do deploy.yml por arrancar (`waiting` = à espera do ambiente;
 * `queued` = à espera de runner; `pending` = atrás da concurrency `pages`). Precisa de
 * `actions: read`. `ghApi(path, jq)` devolve string ou null.
 * @param {(path: string, jq: string) => string | null} ghApi
 * @param {{ repo?: string; workflowFile?: string }} [opts]
 * @returns {Array<object> | null} null quando o API falhou (desconhecido ≠ vazio)
 */
function listPendingDeploys(ghApi, opts = {}) {
  const repo = opts.repo || process.env.GITHUB_REPOSITORY || 'braindeadpt/VenTu';
  const wf = opts.workflowFile || 'deploy.yml';
  const jq = '[.workflow_runs[] | {id, status, created_at, html_url}]';
  const all = [];
  let anyOk = false;
  for (const status of PENDING_DEPLOY_STATUSES) {
    const raw = ghApi(`repos/${repo}/actions/workflows/${wf}/runs?status=${status}&per_page=20`, jq);
    if (raw == null) continue;
    try {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        anyOk = true;
        all.push(...list);
      }
    } catch {
      /* resposta inválida — conta como falha deste status */
    }
  }
  return anyOk ? all : null;
}

/**
 * Corpo da issue `data-stale` quando a causa é o live atrasado.
 * @param {ReturnType<typeof evaluateLiveSync>} ls
 */
function liveSyncBody(ls) {
  return [
    'A main tem dados frescos mas **ventu.surf não os está a servir** — o deploy parou atrás do pipeline.',
    '',
    ...ls.reasons.map((r) => `- ${r}`),
    `- \`lastRunAt\` main: **${ls.mainLastRunAt || '—'}** · live: **${ls.liveLastRunAt || '—'}**`,
    '',
    'Receita:',
    '- Runs do deploy: `gh run list --workflow=deploy.yml --limit 5` (procurar `waiting`/`queued` ou falhas na resolução do código verde).',
    '- Um run preso na concurrency `pages` bloqueia todos os seguintes: cancelar o preso e disparar `gh workflow run deploy.yml`.',
    '- Gerido por `scripts/lib/liveSync.js` (staleness-alert.yml / data-cadence-alert.yml): fechado automaticamente quando o live voltar a apanhar a main.',
  ].join('\n');
}

module.exports = {
  LIVE_META_URL_DEFAULT,
  LIVE_SYNC_MAX_LAG_MIN_DEFAULT,
  DEPLOY_STUCK_MAX_MIN_DEFAULT,
  PENDING_DEPLOY_STATUSES,
  evaluateLiveSync,
  fetchLiveMeta,
  listPendingDeploys,
  liveSyncBody,
};
