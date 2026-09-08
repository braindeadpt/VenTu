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

async function main() {
  const nowMs = Date.now();
  const s = evaluatePipelineStaleness(readMeta(), nowMs);

  if (!s.stale) {
    console.log(
      `✅ pipeline-meta fresco — full ${fmt(s.fullAgeHours)} · obs ${fmt(s.obsAgeHours)} (limiar ${s.thresholdHours} h ${s.isDaytime ? 'dia' : 'noite'})`,
    );
    if (ghAvailable()) {
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
  if (ghAvailable()) {
    ensureLabel();
    const issue = openIssue();
    if (issue) {
      console.log(`ℹ️ Incidente #${issue} já aberto — sem spam`);
    } else {
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