#!/usr/bin/env node
/**
 * VenTu — Data cadence heartbeat (workflow data-cadence-alert.yml).
 *
 * The commit-based pair of eyes for the data pipeline: resolves the most
 * recent commit touching public/data/** via the GitHub commits API and
 * alerts when NO DATA COMMIT has landed for longer than the staleness
 * threshold (3h day / 5h night — the SAME thresholds as
 * check-pipeline-staleness.js, shared via pipelineStaleness.js).
 *
 * Why commit-based when staleness-alert.yml already reads
 * pipeline-meta.json? Because "no data commit landed" is the observable
 * truth: a push that failed after generation, a push that carried a
 * meta file never refreshed, or a scheduler that stopped firing are all
 * invisible to the meta file's internal timestamps but show up here the
 * moment the last data commit ages past the threshold. The two heartbeats
 * share the thresholds and the issue lifecycle, and fail independently.
 *
 * State = the open issue with label data-stale (SAME label as the
 * staleness alert — whoever detects the outage first opens it; both close
 * on recovery; the open-issue guard makes concurrent use safe, so one
 * outage never becomes two issues).
 *
 * Alert channels: GitHub issue (GH_TOKEN + issues:write) and ops Telegram
 * (OPS_TELEGRAM_CHAT_ID + TELEGRAM_BOT_TOKEN) on down/up transitions.
 * Exit code: 0 always — the issue/Telegram are the channel, not red runs
 * (same rationale as monitor-ih-tides.sh).
 *
 * Radar probe (2026-09-10): the same workflow also probes the IPMA radar
 * product (manifest imgs-radar.json + newest PNG) with the SAME state-
 * machine as scripts/monitor-ipma-radar.sh (label ipma-radar-outage).
 * The pipeline's radarLayer is warn-only (degradation never fails the
 * data job, so a silent IPMA outage would otherwise be invisible). This
 * probe runs every 30 min (:12/:42) alongside the cadence check — the
 * ih-health.yml monitor runs hourly, so worst-case detection drops from
 * 60 min to 30 min, with no extra workflow.
 *
 * API failures (token/network) degrade to log + exit 0 — a broken tool
 * must not fabricate an outage; the meta-based heartbeat still covers.
 *
 * Usage:
 *   node scripts/check-data-cadence.js              # producao (CI)
 *   REPO=user/repo GH_TOKEN=... node scripts/check-data-cadence.js
 *   RADAR_MANIFEST_URL=... FRAME_BASE_URL=... node scripts/check-data-cadence.js  # override (testes)
 */
const { execFileSync } = require('child_process');
const { evaluateDataCadence } = require('./lib/dataCadence');
const { sendTelegramMessage } = require('./lib/telegram');

const OUTAGE_LABEL = process.env.OUTAGE_LABEL || 'data-stale';
const REPO = process.env.GITHUB_REPOSITORY || 'braindeadpt/VenTu';
/** Path filter for the commits API — commits touching public/data only. */
const DATA_PATH = 'public/data';

const RADAR_OUTAGE_LABEL = process.env.RADAR_OUTAGE_LABEL || 'ipma-radar-outage';
const RADAR_MANIFEST_URL = process.env.RADAR_MANIFEST_URL || 'https://www.ipma.pt/resources.www/transf/radar/imgs-radar.json';
const RADAR_FRAME_BASE_URL = process.env.FRAME_BASE_URL || 'https://www.ipma.pt/resources.www/transf/radar/por/';

const fmt = (h) => (h === null ? '—' : `${h.toFixed(1)} h`);
const nowUtc = () => new Date().toISOString().replace('T', ' ').replace('Z', ' UTC');

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

/** Most recent public/data commit's committer date (ms), or null. */
function lastDataCommitAt() {
  const out = gh(
    'api', `repos/${REPO}/commits?path=${DATA_PATH}&per_page=1`,
    '--jq', '.[0].commit.committer.date',
  );
  if (!out) return null;
  const t = new Date(out).getTime();
  return Number.isFinite(t) ? t : null;
}

function openIssue() {
  return (
    gh(
      'issue', 'list', '--repo', REPO, '--label', OUTAGE_LABEL, '--state', 'open',
      '--json', 'number', '--jq', '.[0].number // empty',
    ) || ''
  );
}

function ensureLabel() {
  gh(
    'label', 'create', OUTAGE_LABEL, '--repo', REPO, '--force', '--color', 'b60205',
    '--description', 'Pipeline de dados em silêncio (sem commit de dados recente)',
  );
}

function dispatchKeepAlive() {
  // GitHub-native fallback: the heartbeat itself resurrects the pipeline when
  // the GitHub schedule is dropped and no external cron is configured. Uses
  // the same repository_dispatch(ping) the external keep-alive uses — the gate
  // (VENTU_KEEPALIVE=1) only runs when overdue, so a fresh pipeline is a
  // cheap skip. Guarded to fire once per outage (only when opening the issue).
  try {
    execFileSync('gh', ['api', `repos/${REPO}/dispatches`, '--method', 'POST', '-f', 'event_type=ping'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

function staleBody(s) {
  return [
    `Nenhum commit de dados (\`${DATA_PATH}/**\`) aterrou há **${fmt(s.ageHours)}** (limiar: ${s.thresholdHours} h ${s.isDaytime ? 'dia' : 'noite'}) — pipeline morto ou push a falhar.`,
    '',
    '- Medido pelo **committer date** do último commit que toca `public/data/` (API de commits do GitHub), não por timestamps internos de ficheiros.',
    '- Isto apanha um push falhado depois da geração, um meta nunca refrescado, ou um scheduler que parou de disparar — antes de qualquer TTL validator (que só corre QUANDO o pipeline corre).',
    '',
    'Receita:',
    '- Confirmar o último run: `gh run list --workflow=update-data.yml --limit 5`.',
    '- Disparar manualmente: `gh workflow run "Update VenTu Data"` (o gate decide full/obs/skip).',
    '- Se o keep-alive externo estiver configurado, o ping devia ter ressuscitado aos 2,5 h (dia) — se chegou aqui, a ressurreição também falhou.',
    '- Gerido por `scripts/check-data-cadence.js` (workflow \\`data-cadence-alert.yml\\`): comentado e fechado automaticamente quando um commit de dados voltar a aterrar.',
  ].join('\n');
}

function recoveryBody() {
  return `✅ Cadência de dados recuperou — voltou a aterrar um commit em \`${DATA_PATH}/**\` (${nowUtc()}). A fechar o incidente; confirmar o fim-a-fim com um run do \`update-data\`.`;
}

// ── Radar probe (mesma maquina de estados do monitor-ipma-radar.sh) ──

function openRadarIssue() {
  return (
    gh(
      'issue', 'list', '--repo', REPO, '--label', RADAR_OUTAGE_LABEL, '--state', 'open',
      '--json', 'number', '--jq', '.[0].number // empty',
    ) || ''
  );
}

function ensureRadarLabel() {
  gh(
    'label', 'create', RADAR_OUTAGE_LABEL, '--repo', REPO, '--force', '--color', 'b60205',
    '--description', 'Produto radar IPMA degradado (slots path:null / PNG 404)',
  );
}

async function probeRadar() {
  const manifestUrl = RADAR_MANIFEST_URL;
  const frameBase = RADAR_FRAME_BASE_URL;
  let manifestCode = '000';
  let validPaths = 0;
  let pngCode = '000';
  let newestDate = '';
  let newestPath = null;
  let reason = '';
  try {
    const res = await fetch(manifestUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'VenTu-Bot/1.0 (+https://ventu.surf)' },
      signal: AbortSignal.timeout(30000),
    });
    manifestCode = String(res.status);
    if (!res.ok) {
      reason = `manifest HTTP ${res.status}`;
      return { degraded: true, manifestCode, validPaths, pngCode, newestDate, reason };
    }
    const raw = await res.json();
    let frames = [];
    try {
      const { parseManifest } = require('./lib/ipmaRadar.js');
      frames = parseManifest(raw);
    } catch {
      const list = raw && Array.isArray(raw.Portugal) ? raw.Portugal : [];
      frames = list.filter((e) => e && typeof e.path === 'string' && /\.png$/i.test(e.path));
    }
    validPaths = frames.length;
    if (frames.length > 0) {
      newestDate = frames[0].date || '';
      newestPath = frames[0].path;
    }
    if (validPaths === 0) {
      reason = '0 frames validos (path:null - manifest sem PNGs)';
      return { degraded: true, manifestCode, validPaths, pngCode, newestDate, reason };
    }
    try {
      const pngRes = await fetch(frameBase + newestPath, {
        headers: { 'User-Agent': 'VenTu-Bot/1.0 (+https://ventu.surf)' },
        signal: AbortSignal.timeout(30000),
      });
      pngCode = String(pngRes.status);
      if (!pngRes.ok) {
        reason = `PNG mais recente HTTP ${pngRes.status}`;
        return { degraded: true, manifestCode, validPaths, pngCode, newestDate, reason };
      }
    } catch (e) {
      pngCode = '000';
      reason = `PNG fetch failed: ${e.message || e}`;
      return { degraded: true, manifestCode, validPaths, pngCode, newestDate, reason };
    }
    return { degraded: false, manifestCode, validPaths, pngCode, newestDate, reason: '' };
  } catch (e) {
    reason = `manifest fetch failed: ${e.message || e}`;
    return { degraded: true, manifestCode, validPaths, pngCode, newestDate, reason };
  }
}

function radarStaleBody(r) {
  return [
    `O produto radar do IPMA esta degradado: o manifest \`imgs-radar.json\` nao esta a servir os frames PNG.`,
    '',
    `- Manifest: HTTP ${r.manifestCode} - frames validos: ${r.validPaths} - slot mais recente: ${r.newestDate || '--'} - PNG mais recente: HTTP ${r.pngCode}`,
    `- Razao: ${r.reason || '--'}`,
    `- O site continua a servir o ultimo frame bom em cache (camada \`radarLayer\` e warn-only no pipeline de dados — os dados essenciais nao sao afectados).`,
    `- Detectado tambem pelo heartbeat \`data-cadence-alert\` (a cada 30 min, alem do \`ih-health\` horario) — a camada warn-only nunca falha o job, por isso a degradacao seria invisivel sem este probe.`,
    `- Gerido por \`scripts/check-data-cadence.js\` + \`scripts/monitor-ipma-radar.sh\` (label \`${RADAR_OUTAGE_LABEL}\`): sera comentado e fechado automaticamente quando o produto recuperar.`,
  ].join('\n');
}

function radarRecoveryBody(r) {
  return `Produto radar IPMA recuperou — \`imgs-radar.json\` voltou a servir frames PNG (manifest ${r.manifestCode}, ${r.validPaths} frame(s), PNG ${r.pngCode}, ${nowUtc()}). A fechar o incidente; o proximo run do \`update-data\` volta a publicar frames novos.`;
}

async function handleCadence(ghOk) {
  const lastCommitAt = lastDataCommitAt();
  if (lastCommitAt === null) {
    console.log('⚠️ Não foi possível resolver o último commit de dados (API) — a saltar este ciclo; o staleness-alert cobre.');
    return;
  }

  const s = evaluateDataCadence(lastCommitAt);

  if (!s.stale) {
    console.log(
      `✅ cadência OK — último commit de dados há ${fmt(s.ageHours)} (limiar ${s.thresholdHours} h ${s.isDaytime ? 'dia' : 'noite'})`,
    );
    if (ghOk) {
      const issue = openIssue();
      if (issue) {
        gh('issue', 'comment', issue, '--repo', REPO, '--body', recoveryBody());
        gh('issue', 'close', issue, '--repo', REPO);
        console.log(`🔔 RECOVERY — incidente #${issue} comentado e fechado`);
        const chat = process.env.OPS_TELEGRAM_CHAT_ID;
        if (chat) {
          await sendTelegramMessage(chat, `✅ VenTu: cadência de dados recuperou — último commit há ${fmt(s.ageHours)}. Incidente #${issue} fechado.`);
        }
      } else {
        console.log('ℹ️ fresco sem incidente aberto — estado normal (sem notificação)');
      }
    } else {
      console.log('ℹ️ fresco — gh/GH_TOKEN indisponível (sem notificação por issue)');
    }
    return;
  }

  console.log(
    `🔴 cadência STALE — último commit de dados há ${fmt(s.ageHours)} (limiar ${s.thresholdHours} h ${s.isDaytime ? 'dia' : 'noite'})`,
  );
  if (ghOk) {
    ensureLabel();
    const issue = openIssue();
    if (issue) {
      console.log(`ℹ️ Incidente #${issue} já aberto — sem spam`);
    } else {
      if (dispatchKeepAlive()) {
        console.log('🔄 keep-alive ping dispatched (heartbeat fallback) — gate decides full/obs/skip');
      }
      const url = gh(
        'issue', 'create', '--repo', REPO, '--label', OUTAGE_LABEL,
        '--title', `Dados em silêncio — sem commit de dados há ${fmt(s.ageHours)} (${nowUtc()})`,
        '--body', staleBody(s),
      );
      if (url) {
        console.log(`🔔 ALERTA — aberto incidente: ${url}`);
        const chat = process.env.OPS_TELEGRAM_CHAT_ID;
        if (chat) {
          await sendTelegramMessage(chat, `🚨 VenTu: sem commit de dados há ${fmt(s.ageHours)} (limiar ${s.thresholdHours} h) — ${nowUtc()}. Issue aberto: ${url}`);
        }
      } else {
        console.log('⚠️ falhou a criar a issue (permissões do GITHUB_TOKEN?)');
      }
    }
  } else {
    console.log('ℹ️ STALE — gh/GH_TOKEN indisponível (sem notificação por issue)');
  }
}

async function handleRadar(ghOk) {
  console.log('--- probe IPMA radar (manifest + PNG) ---');
  const r = await probeRadar();
  if (!r.degraded) {
    console.log(`✅ IPMA radar — UP (manifest ${r.manifestCode}, ${r.validPaths} frame(s), PNG ${r.pngCode})`);
    if (ghOk) {
      const issue = openRadarIssue();
      if (issue) {
        gh('issue', 'comment', issue, '--repo', REPO, '--body', radarRecoveryBody(r));
        gh('issue', 'close', issue, '--repo', REPO);
        console.log(`🔔 RADAR RECOVERY — incidente #${issue} comentado e fechado`);
        const chat = process.env.OPS_TELEGRAM_CHAT_ID;
        if (chat) {
          await sendTelegramMessage(chat, `✅ VenTu: produto radar IPMA recuperou (manifest ${r.manifestCode}, ${r.validPaths} frames, PNG ${r.pngCode}) — incidente #${issue} fechado.`);
        }
      } else {
        console.log('ℹ️ radar UP sem incidente aberto — estado normal (sem notificação)');
      }
    } else {
      console.log('ℹ️ radar UP — gh/GH_TOKEN indisponível (sem notificação por issue)');
    }
    return;
  }

  console.log(`🔴 IPMA radar — DEGRADED (manifest ${r.manifestCode}, ${r.validPaths} frame(s) validos, PNG ${r.pngCode}, slot mais recente: ${r.newestDate || '?'}) - ${r.reason}`);
  if (ghOk) {
    ensureRadarLabel();
    const issue = openRadarIssue();
    if (issue) {
      console.log(`ℹ️ Radar incidente #${issue} já aberto — sem spam`);
    } else {
      const url = gh(
        'issue', 'create', '--repo', REPO, '--label', RADAR_OUTAGE_LABEL,
        '--title', `IPMA radar degraded — imgs-radar.json (${nowUtc()})`,
        '--body', radarStaleBody(r),
      );
      if (url) {
        console.log(`🔔 RADAR ALERTA — aberto incidente: ${url}`);
        const chat = process.env.OPS_TELEGRAM_CHAT_ID;
        if (chat) {
          await sendTelegramMessage(chat, `🚨 VenTu: produto radar IPMA degradado (manifest ${r.manifestCode}, ${r.validPaths} frames, PNG ${r.pngCode}) — ${nowUtc()}. Issue aberto: ${url}`);
        }
      } else {
        console.log('⚠️ radar: falhou a criar a issue (permissões do GITHUB_TOKEN?)');
      }
    }
  } else {
    console.log('ℹ️ radar DEGRADED — gh/GH_TOKEN indisponível (sem notificação por issue)');
  }
}

async function main() {
  const ghOk = ghAvailable();
  if (!ghOk) {
    console.log('⚠️ gh/GH_TOKEN indisponível — dry-run (sem issue/Telegram).');
  }
  await handleCadence(ghOk);
  await handleRadar(ghOk);
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ check-data-cadence failed:', e.message || e);
  process.exit(0); // the monitor itself must never turn runs red
});