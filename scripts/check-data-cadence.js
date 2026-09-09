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
 * API failures (token/network) degrade to log + exit 0 — a broken tool
 * must not fabricate an outage; the meta-based heartbeat still covers.
 *
 * Usage:
 *   node scripts/check-data-cadence.js              # produção (CI)
 *   REPO=user/repo GH_TOKEN=... node scripts/check-data-cadence.js
 */
const { execFileSync } = require('child_process');
const { evaluateDataCadence } = require('./lib/dataCadence');
const { sendTelegramMessage } = require('./lib/telegram');

const OUTAGE_LABEL = process.env.OUTAGE_LABEL || 'data-stale';
const REPO = process.env.GITHUB_REPOSITORY || 'braindeadpt/VenTu';
/** Path filter for the commits API — commits touching public/data only. */
const DATA_PATH = 'public/data';

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

async function main() {
  if (!ghAvailable()) {
    console.log('⚠️ gh/GH_TOKEN indisponível — dry-run (sem issue/Telegram).');
  }
  const lastCommitAt = lastDataCommitAt();
  if (lastCommitAt === null) {
    // API falhou (token/rede) → não fabricar uma outage; o heartbeat por
    // meta (staleness-alert.yml) continua a cobrir. Log alto e exit 0.
    console.log('⚠️ Não foi possível resolver o último commit de dados (API) — a saltar este ciclo; o staleness-alert cobre.');
    return;
  }

  const s = evaluateDataCadence(lastCommitAt);

  if (!s.stale) {
    console.log(
      `✅ cadência OK — último commit de dados há ${fmt(s.ageHours)} (limiar ${s.thresholdHours} h ${s.isDaytime ? 'dia' : 'noite'})`,
    );
    if (ghAvailable()) {
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
    process.exit(0);
  }

  console.log(
    `🔴 cadência STALE — último commit de dados há ${fmt(s.ageHours)} (limiar ${s.thresholdHours} h ${s.isDaytime ? 'dia' : 'noite'})`,
  );
  if (ghAvailable()) {
    ensureLabel();
    const issue = openIssue();
    if (issue) {
      console.log(`ℹ️ Incidente #${issue} já aberto — sem spam`);
    } else {
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
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ check-data-cadence failed:', e.message || e);
  process.exit(0); // the monitor itself must never turn runs red
});