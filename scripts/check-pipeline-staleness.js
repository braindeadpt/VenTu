#!/usr/bin/env node
/**
 * VenTu — Pipeline staleness heartbeat (workflow staleness-alert.yml).
 *
 * Runs on its own schedule (every 30 min) and checks that
 * public/data/pipeline-meta.json is still being refreshed. The pipeline's
 * own TTL validator only runs WHEN the pipeline runs, so a dead pipeline
 * (missed GitHub schedule delivery, failed job) is invisible to every
 * check it owns — this heartbeat is the independent pair of eyes.
 *
 * State = the open issue with label $OUTAGE_LABEL (same pattern as
 * scripts/monitor-ih-tides.sh): no external state — the down→up
 * transition is detected by the issue's presence.
 *   - STALE  → ensure label, open the issue if none open (Telegram alert
 *              on that transition — once per incident, no spam).
 *   - FRESH  → if an issue is open, comment + close it (Telegram recovery
 *              on that transition).
 *
 * Alert channels, in order of reliability: GitHub issue (GH_TOKEN +
 * issues:write, always available in Actions) and ops Telegram
 * (OPS_TELEGRAM_CHAT_ID + TELEGRAM_BOT_TOKEN, piggybacks on the issue
 * transitions so a long outage alerts once, not every run).
 *
 * Live-sync (scripts/lib/liveSync.js): a main fresca não chega se o deploy
 * parou — o mesmo incidente `data-stale` abre quando o `lastRunAt` da main
 * não chegou a https://ventu.surf/data/pipeline-meta.json há > 60 min, ou
 * quando um run do deploy.yml está em waiting/queued/pending há > 60 min
 * (precisa de `actions: read`). Só fecha quando a main está fresca E o live
 * a apanhou.
 *
 * Exit code: 0 always — the monitor ran; the alert is delivered by issue
 * + Telegram, not by turning every run red during an outage (same
 * rationale as monitor-ih-tides.sh).
 *
 * Usage:
 *   node scripts/check-pipeline-staleness.js              # produção (CI)
 *   PIPELINE_META_ROOT=... node scripts/check-pipeline-staleness.js   # testes
 *   REPO=user/repo GH_TOKEN=... node scripts/check-pipeline-staleness.js
 */
const { execFileSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');
const { join } = require('path');
const {
  evaluatePipelineStaleness,
  STALE_ALERT_HOURS_DAY,
  STALE_ALERT_HOURS_NIGHT,
} = require('./lib/pipelineStaleness');
const { sendTelegramMessage } = require('./lib/telegram');
const { evaluateLiveSync, fetchLiveMeta, listPendingDeploys, liveSyncBody } = require('./lib/liveSync');

const OUTAGE_LABEL = process.env.OUTAGE_LABEL || 'data-stale';
const REPO = process.env.GITHUB_REPOSITORY || 'braindeadpt/VenTu';
const META_PATH = process.env.PIPELINE_META_ROOT
  ? join(process.env.PIPELINE_META_ROOT, 'public', 'data', 'pipeline-meta.json')
  : join(__dirname, '..', 'public', 'data', 'pipeline-meta.json');

const fmt = (h) => (h === null ? '—' : `${h.toFixed(1)} h`);
const nowUtc = () => new Date().toISOString().replace('T', ' ').replace('Z', ' UTC');

function readMeta() {
  if (!existsSync(META_PATH)) return null;
  try {
    return JSON.parse(readFileSync(META_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function gh(...args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function ghApi(path, jq) {
  return gh('api', path, '--jq', jq);
}

function ghAvailable() {
  return Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN) && gh('--version') !== null;
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
    '--description', 'Pipeline de dados em silêncio (pipeline-meta stale)',
  );
}

function dispatchKeepAlive() {
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
    `O pipeline de dados está em silêncio — \`public/data/pipeline-meta.json\` não é refrescado há **${fmt(s.fullAgeHours ?? s.obsAgeHours)}** (limiar: ${s.thresholdHours} h ${s.isDaytime ? 'dia' : 'noite'}).`,
    '',
    `- \`fullUpdatedAt\` (Open-Meteo): **${fmt(s.fullAgeHours)}**`,
    `- \`observationsUpdatedAt\` (IH/IPMA/Ecowitt): **${fmt(s.obsAgeHours)}**`,
    '- Isto significa que uma ou mais janelas agendadas (\`:17\`/\`:47\` UTC) foram perdidas ou o job falhou.',
    '',
    'Receita:',
    '- Confirmar o último run: `gh run list --workflow=update-data.yml --limit 5`.',
    '- Disparar manualmente: `gh workflow run "Update VenTu Data"` (o gate decide full/obs/skip).',
    '- Se o keep-alive externo estiver configurado, o ping devia ter ressuscitado o pipeline aos 2,5 h (dia) — se chegou aqui, a ressurreição também falhou.',
    '- Gerido por `scripts/check-pipeline-staleness.js` (workflow \`staleness-alert.yml\`): comentado e fechado automaticamente quando os dados voltarem a refrescar.',
  ].join('\n');
}

function recoveryBody() {
  return `✅ Pipeline de dados recuperou — \`pipeline-meta.json\` voltou a refrescar (${nowUtc()}). A fechar o incidente; confirmar o fim-a-fim com um run do \`update-data\`.`;
}

async function evaluateLive(mainMeta, nowMs, ghOk) {
  if (process.env.LIVE_SYNC_DISABLED === '1') return null;
  const live = await fetchLiveMeta({ nowMs });
  const pendingDeploys = ghOk ? listPendingDeploys(ghApi, { repo: REPO }) : null;
  const ls = evaluateLiveSync({ mainMeta, liveMeta: live.meta, liveOk: live.ok, pendingDeploys, nowMs });
  if (ls.unknown) console.log(`ℹ️ live-sync: pipeline-meta do live inalcançável (${live.error || '?'}) — sem veredicto do live`);
  if (pendingDeploys === null && ghOk) console.log('ℹ️ live-sync: runs do deploy indisponíveis (actions: read?)');
  console.log(
    ls.behind
      ? `🔴 live-sync ATRASADO — ${ls.reasons.join(' · ')}`
      : `✅ live-sync — main ${ls.mainLastRunAt || '—'} · live ${ls.liveLastRunAt || '—'}`,
  );
  return ls;
}

async function main() {
  const nowMs = Date.now();
  const mainMeta = readMeta();
  const s = evaluatePipelineStaleness(mainMeta, nowMs);
  const ghOk = ghAvailable();
  const ls = await evaluateLive(mainMeta, nowMs, ghOk);

  if (!s.stale && ls && ls.behind) {
    // Main fresca, produção parada: mesmo incidente, mesma label, sem
    // keep-alive (o pipeline está vivo — reanimá-lo não resolve o deploy).
    if (ghOk) {
      ensureLabel();
      const issue = openIssue();
      if (issue) {
        console.log(`ℹ️ Incidente #${issue} já aberto — sem spam (não fecha enquanto o live estiver atrasado)`);
      } else {
        const url = gh(
          'issue', 'create', '--repo', REPO, '--label', OUTAGE_LABEL,
          '--title', `Produção atrás da main — ventu.surf sem o último run de dados (${nowUtc()})`,
          '--body', liveSyncBody(ls),
        );
        if (url) {
          console.log(`🔔 ALERTA live-sync — aberto incidente: ${url}`);
          const chat = process.env.OPS_TELEGRAM_CHAT_ID;
          if (chat) {
            await sendTelegramMessage(chat, `🚨 VenTu: ventu.surf atrás da main — ${ls.reasons.join(' · ')} — ${nowUtc()}. Issue aberto: ${url}`);
          }
        } else {
          console.log('⚠️ falhou a criar a issue (permissões do GITHUB_TOKEN?)');
        }
      }
    } else {
      console.log('ℹ️ live atrasado — gh/GH_TOKEN indisponível (sem notificação por issue)');
    }
    process.exit(0);
  }

  if (!s.stale) {
    console.log(
      `✅ pipeline-meta fresco — full ${fmt(s.fullAgeHours)} · obs ${fmt(s.obsAgeHours)} (limiar ${s.thresholdHours} h ${s.isDaytime ? 'dia' : 'noite'})`,
    );
    if (ghOk) {
      const issue = openIssue();
      if (issue) {
        gh('issue', 'comment', issue, '--repo', REPO, '--body', recoveryBody());
        gh('issue', 'close', issue, '--repo', REPO);
        console.log(`🔔 RECOVERY — incidente #${issue} comentado e fechado`);
        const chat = process.env.OPS_TELEGRAM_CHAT_ID;
        if (chat) {
          await sendTelegramMessage(chat, `✅ VenTu: pipeline de dados recuperou (${nowUtc()}) — incidente #${issue} fechado.`);
        }
      } else {
        console.log('ℹ️ fresco sem incidente aberto — estado normal (sem notificação)');
      }
    } else {
      console.log('ℹ️ fresco — gh/GH_TOKEN indisponível (sem notificação por issue)');
    }
    process.exit(0);
  }

  console.log(
    `🔴 pipeline-meta STALE — full ${fmt(s.fullAgeHours)} · obs ${fmt(s.obsAgeHours)} > ${s.thresholdHours} h (${s.isDaytime ? 'dia' : 'noite'}) — camada ${s.staleLayer}`,
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
        '--title', `Pipeline de dados em silêncio — pipeline-meta com ${fmt(s.fullAgeHours ?? s.obsAgeHours)} (${nowUtc()})`,
        '--body', staleBody(s),
      );
      if (url) {
        console.log(`🔔 ALERTA — aberto incidente: ${url}`);
        const chat = process.env.OPS_TELEGRAM_CHAT_ID;
        if (chat) {
          await sendTelegramMessage(
            chat,
            `🚨 VenTu: pipeline de dados em silêncio há ${fmt(s.fullAgeHours ?? s.obsAgeHours)} (limiar ${s.thresholdHours} h) — ${nowUtc()}. Issue aberto: ${url}`,
          );
        }
      } else {
        console.log('⚠️ falhou a criar a issue (permissões do GITHUB_TOKEN?)');
      }
    }
  } else {
    console.log('ℹ️ STALE — gh/GH_TOKEN indisponível (sem notificação por issue)');
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ staleness heartbeat failed:', e.message);
  process.exit(0); // the monitor itself must never turn runs red
});