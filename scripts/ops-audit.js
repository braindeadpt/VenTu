#!/usr/bin/env node
/**
 * VenTu — Ops audit diário (workflow ops-audit.yml).
 *
 * Auditoria determinística das ligações externas e dos crons — a camada que
 * faltava acima dos heartbeats: o staleness-alert lê pipeline-meta.json e o
 * data-cadence lê o último commit de dados, mas nenhum verifica que os
 * workflows estão a correr bem, que os endpoints externos respondem, ou que
 * o código não regridiu (fetch novo sem timeout, job sem timeout-minutes).
 * Este script junta as quatro frentes num relatório diário.
 *
 * Secções:
 *   A. Produção    — pipeline-meta.json servido em ventu.surf (staleness +
 *                    streaks de camadas: buoy/radar/warnings/coastal/tide).
 *   B. Workflows   — últimos runs do update-data/deploy/api-keys via gh,
 *                    último commit de dados (evaluateDataCadence), issues de
 *                    incidente abertas (data-stale, ih-outage, …).
 *   C. Endpoints   — probes directos (HTTP + latência): IH tides, IPMA
 *                    warnings, IPMA radar manifest, Open-Meteo marine,
 *                    observations worker (/obs + /health).
 *   D. Drift       — fetches novos em scripts/ sem AbortSignal.timeout e
 *                    jobs em .github/workflows/ sem timeout-minutes.
 *
 * Severidade: P0 = produção/pipeline a falhar · P1 = camada degradada ou
 * incidente aberto · P2 = drift de higiene (regressões futuras).
 *
 * Estado = issue aberta com label `ops-audit` (mesmo padrão dos monitores):
 * abre na transição limpo→findings, comenta+fecha na recuperação. Alerta
 * Telegram (OPS_TELEGRAM_CHAT_ID) só nas transições — uma semana de drift
 * não acorda ninguém todos os dias.
 *
 * Exit code: 0 sempre — a issue/Telegram são o canal, não o exit code.
 *
 * Usage:
 *   node scripts/ops-audit.js                     # produção (CI)
 *   SITE_URL=http://localhost:4173 node scripts/ops-audit.js   # outro alvo
 */
const { execFileSync } = require('child_process');
const { readdirSync, readFileSync, existsSync } = require('fs');
const { join } = require('path');
const { evaluatePipelineStaleness } = require('./lib/pipelineStaleness');
const { evaluateDataCadence } = require('./lib/dataCadence');
const { parseManifest } = require('./lib/ipmaRadar');
const {
  resolveObsWorkerBase,
  buildObsProbeUrl,
  buildHealthUrl,
  evaluateObsPayload,
} = require('./lib/obsWorkerHealth');
const { sendTelegramMessage } = require('./lib/telegram');

const SITE_URL = (process.env.SITE_URL || 'https://ventu.surf').replace(/\/+$/, '');
const OBS_BASE = resolveObsWorkerBase(
  process.env.OBS_WORKER_URL || process.env.NEXT_PUBLIC_OBS_WORKER_URL,
);
const OUTAGE_LABEL = process.env.OPS_AUDIT_LABEL || 'ops-audit';
const REPO = process.env.GITHUB_REPOSITORY || 'braindeadpt/VenTu';
const REPO_ROOT = join(__dirname, '..');
const FETCH_TIMEOUT_MS = 15_000;
/** Labels de incidente geridas pelos monitores — abertas = finding P1. */
const INCIDENT_LABELS = ['data-stale', 'ih-outage', 'ipma-radar-outage'];

const nowUtc = () => new Date().toISOString().replace('T', ' ').replace('Z', ' UTC');
const fmt = (h) => (h === null ? '—' : `${h.toFixed(1)} h`);

/** findings: { sev: 'P0'|'P1'|'P2', text } — texto já com contexto. */
const findings = [];
const finding = (sev, text) => findings.push({ sev, text });

function gh(...args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function ghAvailable() {
  return Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN) && gh('--version') !== null;
}

async function probe(name, url, validate) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'VenTu-Bot/1.0 (+https://ventu.surf)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      finding('P1', `probe ${name}: HTTP ${res.status} (${ms} ms)`);
      return { ok: false, status: res.status, ms };
    }
    if (validate) {
      const body = await res.text();
      const bad = validate(body);
      if (bad) {
        finding('P1', `probe ${name}: HTTP 200 mas payload inválido — ${bad} (${ms} ms)`);
        return { ok: false, status: res.status, ms };
      }
    }
    console.log(`  ✅ ${name}: HTTP ${res.status} (${ms} ms)`);
    return { ok: true, status: res.status, ms };
  } catch (e) {
    const ms = Date.now() - t0;
    finding('P1', `probe ${name}: ${e.name === 'TimeoutError' || e.name === 'AbortError' ? `timeout ${FETCH_TIMEOUT_MS}ms` : e.message} (${ms} ms)`);
    return { ok: false, status: 0, ms };
  }
}

// ── A. Produção ─────────────────────────────────────────────────────────

async function auditProduction() {
  console.log('— A. Produção (pipeline-meta.json em ventu.surf) —');
  const t0 = Date.now();
  let meta = null;
  try {
    const res = await fetch(`${SITE_URL}/data/pipeline-meta.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      finding('P0', `pipeline-meta.json em produção: HTTP ${res.status}`);
      return;
    }
    meta = await res.json();
    console.log(`  meta servido (${Date.now() - t0} ms)`);
  } catch (e) {
    finding('P0', `pipeline-meta.json unreachable: ${e.message}`);
    return;
  }

  const s = evaluatePipelineStaleness(meta);
  console.log(
    `  full ${fmt(s.fullAgeHours)} · obs ${fmt(s.obsAgeHours)} (limiar ${s.thresholdHours} h ${s.isDaytime ? 'dia' : 'noite'})`,
  );
  if (s.stale) {
    finding('P0', `pipeline-meta em produção STALE — ${s.staleLayer} (limiar ${s.thresholdHours} h)`);
  }

  for (const key of ['buoyLayer', 'radarLayer', 'warningsLayer', 'coastalWarningsLayer', 'tideLayer']) {
    const layer = meta[key];
    if (!layer) continue;
    const streak = Number(layer.streak) || 0;
    if (layer.status === 'down' || (layer.status === 'stale' && streak > 0) || streak > 0) {
      finding(
        streak >= 3 ? 'P1' : 'P2',
        `${key}: status=${layer.status} streak=${streak} runs consecutivos`,
      );
    }
  }
}

// ── B. Workflows ────────────────────────────────────────────────────────

async function auditWorkflows(ghOk) {
  console.log('— B. Workflows (gh) —');
  if (!ghOk) {
    console.log('  gh/GH_TOKEN indisponível — secção saltada');
    return;
  }

  for (const wf of ['update-data.yml', 'deploy.yml', 'api-keys.yml']) {
    const out = gh(
      'run', 'list', '--repo', REPO, '--workflow', wf,
      '--limit', '10', '--json', 'conclusion,status,createdAt',
    );
    let runs = [];
    try {
      runs = out ? JSON.parse(out) : [];
    } catch {
      runs = [];
    }
    const done = runs.filter((r) => r.status === 'completed');
    const failures = done.filter((r) => r.conclusion === 'failure').length;
    const latest = done[0];
    console.log(`  ${wf}: ${done.length} runs recentes, ${failures} falhados (último: ${latest?.conclusion ?? '?'})`);
    if (latest?.conclusion === 'failure') {
      finding(wf === 'api-keys.yml' ? 'P2' : 'P1', `workflow ${wf}: último run falhou (${latest.createdAt})`);
    } else if (failures >= 3) {
      finding('P1', `workflow ${wf}: ${failures}/${done.length} runs recentes falharam`);
    }
  }

  // Último commit de dados — o mesmo observável do data-cadence-alert.
  const out = gh(
    'api', `repos/${REPO}/commits?path=public/data&per_page=1`,
    '--jq', '.[0].commit.committer.date',
  );
  const lastCommitAt = out ? new Date(out).getTime() : NaN;
  if (Number.isFinite(lastCommitAt)) {
    const s = evaluateDataCadence(lastCommitAt);
    console.log(`  último commit de dados há ${fmt(s.ageHours)} (limiar ${s.thresholdHours} h)`);
    if (s.stale) {
      finding('P0', `sem commit em public/data há ${fmt(s.ageHours)} (limiar ${s.thresholdHours} h)`);
    }
  } else {
    console.log('  último commit de dados não resolvido — staleness-alert cobre');
  }

  // Issues de incidente abertas pelos monitores — se alguma está aberta,
  // há uma outage em curso que merece visibilidade no relatório diário.
  for (const label of INCIDENT_LABELS) {
    const n = gh(
      'issue', 'list', '--repo', REPO, '--label', label, '--state', 'open',
      '--json', 'number', '--jq', '.[0].number // empty',
    );
    if (n) {
      finding('P1', `incidente aberto: #${n} (label ${label}) — ver Actions/issues`);
    }
  }
}

// ── C. Endpoints externos ───────────────────────────────────────────────

async function auditEndpoints() {
  console.log('— C. Endpoints externos —');
  await probe(
    'IH tides (tide_obs_nrt)',
    'https://ogcapi.hidrografico.pt/collections/tide_obs_nrt/items?limit=1&f=json',
    (body) => {
      try {
        const j = JSON.parse(body);
        return Array.isArray(j?.features) ? null : 'sem features[]';
      } catch {
        return 'não é JSON';
      }
    },
  );
  // Tripwire de migração: o IH anunciou que a API Datawell keyed
  // (getDatawellData em supportserver1) será descontinuada e substituída por
  // uma OGC API EDR. Enquanto buoys_datawell for Features-only não há nada a
  // fazer; quando ganhar data_queries (EDR), avisar para planear a migração
  // das séries de onda em scripts/lib/ihBuoys.js.
  await probe(
    'IH buoys EDR (migração Datawell)',
    'https://ogcapi.hidrografico.pt/collections/buoys_datawell?f=json',
    (body) => {
      try {
        const j = JSON.parse(body);
        const queries = Object.keys(j?.data_queries ?? {});
        if (queries.length > 0) {
          finding(
            'P2',
            `EDR de boias PUBLICADO (queries: ${queries.join(', ')}) — ` +
              'getDatawellData vai ser descontinuado: migrar as séries de onda ' +
              'para ogcapi EDR (scripts/lib/ihBuoys.js).',
          );
        }
        return null;
      } catch {
        return 'não é JSON';
      }
    },
  );
  await probe(
    'IPMA warnings',
    'https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json',
    // O payload é um array top-level (ver ipmaWarnings.buildWarningsPayload).
    (body) => {
      try {
        return Array.isArray(JSON.parse(body)) ? null : 'esperado array top-level';
      } catch {
        return 'não é JSON';
      }
    },
  );
  await probe(
    'IPMA radar manifest',
    'https://www.ipma.pt/resources.www/transf/radar/imgs-radar.json',
    (body) => {
      try {
        const frames = parseManifest(JSON.parse(body));
        if (!frames.length) return '0 frames válidos (path:null)';
        return null;
      } catch {
        return 'não é JSON';
      }
    },
  );
  await probe(
    'Open-Meteo marine',
    'https://marine-api.open-meteo.com/v1/marine?latitude=38.7&longitude=-9.4&hourly=wave_height&forecast_days=1',
    (body) => {
      try {
        const j = JSON.parse(body);
        return Array.isArray(j?.hourly?.wave_height) ? null : 'sem hourly.wave_height';
      } catch {
        return 'não é JSON';
      }
    },
  );
  // /health pode 404 enquanto o worker deployado for anterior à rota
  // (api-keys.yml trata como aviso) — P2 informativo, /obs é o probe real.
  const before = findings.length;
  const health = await probe('obs worker /health', buildHealthUrl(OBS_BASE));
  if (!health.ok && health.status === 404 && findings.length > before) {
    findings[findings.length - 1] = {
      sev: 'P2',
      text: 'obs worker /health 404 — deploy anterior à rota (informativo; /obs é o probe real)',
    };
  }
  const obs = await probe('obs worker /obs (Porto)', buildObsProbeUrl(OBS_BASE), (body) => {
    try {
      const evaled = evaluateObsPayload(JSON.parse(body));
      return evaled.ok ? null : evaled.reason;
    } catch {
      return 'não é JSON';
    }
  });
  if (obs.ok) console.log(`  obs worker fonte activa: OK`);
}

// ── D. Drift de código ──────────────────────────────────────────────────

function auditDrift() {
  console.log('— D. Drift de código —');

  // 1. Fetches sem timeout: qualquer `await fetch(` / `fetchImpl(` cujo bloco
  //    de argumentos (até 8 linhas) não traz `signal:` — o fix do audit
  //    2026-09-11 não pode regredir em silêncio.
  const scriptsDir = join(REPO_ROOT, 'scripts');
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p);
      } else if (/\.(js|mjs|cjs)$/.test(e.name)) {
        files.push(p);
      }
    }
  };
  walk(scriptsDir);
  const FETCH_RE = /(?:await\s+fetch|fetchImpl)\s*\(/;
  for (const file of files) {
    const lines = readFileSync(file, 'utf-8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!FETCH_RE.test(lines[i])) continue;
      const block = lines.slice(i, i + 8).join('\n');
      if (!/signal\s*:|AbortSignal/.test(block)) {
        finding('P2', `fetch sem AbortSignal.timeout: ${file.replace(REPO_ROOT, '').replace(/\\/g, '/')} linha ${i + 1}`);
      }
    }
  }

  // 2. Jobs sem timeout-minutes: cada `runs-on:` num workflow deve ter um
  //    `timeout-minutes` nas ~8 linhas envolventes.
  const wfDir = join(REPO_ROOT, '.github', 'workflows');
  if (existsSync(wfDir)) {
    for (const f of readdirSync(wfDir)) {
      if (!/\.(ya?ml)$/.test(f)) continue;
      const lines = readFileSync(join(wfDir, f), 'utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!/^\s+runs-on:/.test(lines[i])) continue;
        const window = lines.slice(Math.max(0, i - 6), i + 7).join('\n');
        if (!/timeout-minutes:/.test(window)) {
          finding('P2', `job sem timeout-minutes: .github/workflows/${f} linha ${i + 1}`);
        }
      }
    }
  }
  console.log(`  drift scan: ${files.length} scripts + workflows verificados`);
}

// ── Issue / Telegram ────────────────────────────────────────────────────

function openAuditIssue() {
  return (
    gh(
      'issue', 'list', '--repo', REPO, '--label', OUTAGE_LABEL, '--state', 'open',
      '--json', 'number', '--jq', '.[0].number // empty',
    ) || ''
  );
}

function ensureAuditLabel() {
  gh(
    'label', 'create', OUTAGE_LABEL, '--repo', REPO, '--force', '--color', 'fb8500',
    '--description', 'Ops audit diário — findings de ligações/crons',
  );
}

function reportBody() {
  const lines = [
    `Ops audit diário — ${nowUtc()}`,
    '',
    ...findings.map((f) => `- **[${f.sev}]** ${f.text}`),
    '',
    'Gerido por `scripts/ops-audit.js` (workflow `ops-audit.yml`): comentado e fechado automaticamente quando ficar limpo.',
  ];
  return lines.join('\n');
}

async function deliver(ghOk) {
  if (findings.length === 0) {
    console.log('✅ ops audit limpo — sem findings');
    if (!ghOk) return;
    const issue = openAuditIssue();
    if (issue) {
      gh('issue', 'comment', issue, '--repo', REPO, '--body',
        `✅ Ops audit limpo (${nowUtc()}) — todos os checks passam. A fechar o incidente.`);
      gh('issue', 'close', issue, '--repo', REPO);
      console.log(`🔔 RECOVERY — issue #${issue} comentada e fechada`);
      const chat = process.env.OPS_TELEGRAM_CHAT_ID;
      if (chat) {
        await sendTelegramMessage(chat, `✅ VenTu: ops audit diário limpo — incidente #${issue} fechado.`);
      }
    }
    return;
  }

  const p0 = findings.filter((f) => f.sev === 'P0').length;
  console.log(`🔴 ${findings.length} finding(s) — ${p0} P0`);
  if (!ghOk) {
    findings.forEach((f) => console.log(`  [${f.sev}] ${f.text}`));
    return;
  }
  ensureAuditLabel();
  const issue = openAuditIssue();
  if (issue) {
    console.log(`ℹ️ Issue #${issue} já aberta — relatório em comentário (sem notificação extra)`);
    gh('issue', 'comment', issue, '--repo', REPO, '--body', reportBody());
    return;
  }
  const url = gh(
    'issue', 'create', '--repo', REPO, '--label', OUTAGE_LABEL,
    '--title', `Ops audit: ${findings.length} finding(s)${p0 ? ` (${p0} P0)` : ''} — ${nowUtc()}`,
    '--body', reportBody(),
  );
  if (url) {
    console.log(`🔔 ALERTA — issue aberta: ${url}`);
    const chat = process.env.OPS_TELEGRAM_CHAT_ID;
    if (chat) {
      const top = findings.slice(0, 5).map((f) => `[${f.sev}] ${f.text}`).join('\n');
      await sendTelegramMessage(
        chat,
        `🚨 VenTu ops audit: ${findings.length} finding(s)${p0 ? ` — ${p0} P0` : ''}\n${top}\n${url}`,
      );
    }
  } else {
    console.log('⚠️ falhou a criar a issue (permissões do GITHUB_TOKEN?)');
  }
}

async function main() {
  console.log(`🔍 VenTu ops audit — ${nowUtc()}\n`);
  const ghOk = ghAvailable();
  if (!ghOk) console.log('⚠️ gh/GH_TOKEN indisponível — dry-run (sem issue/Telegram).');
  await auditProduction();
  await auditWorkflows(ghOk);
  await auditEndpoints();
  auditDrift();
  await deliver(ghOk);
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ ops-audit failed:', e.message || e);
  process.exit(0); // o auditor nunca deve tornar runs vermelhos
});
