/**
 * Forecast-skill regression health-check (step do workflow full, depois do
 * fetch-forecast-skill).
 *
 * Lê o public/data/forecast-skill.json (byBuoy — ME/MAE/RMSE/r/n acumulados
 * run a run), arquiva um snapshot diário por boia (skill-regression-archive.json)
 * e compara a janela RECENTE (últimos 7 dias) com a BASELINE (os 21 dias
 * anteriores) por boia. Uma boia regrediu quando o RMSE (ou |ME|) da janela
 * recente está ≥ limiar acima da baseline — sinal de que o modelo piorou
 * naquela boia, não ruído de 1 dia.
 *
 * O report é escrito em public/data/skill-regression.json (opcional,
 * gitignored — nunca bloqueia o deploy). Com OPS_TELEGRAM_CHAT_ID + TELEGRAM_BOT_TOKEN
 * notifica na transição para regressed (uma vez por boia, não em todos os runs).
 *
 * Usage:
 *   node scripts/check-skill-regression.js
 * Env: FORECAST_SKILL_PATH / SKILL_REGRESSION_ARCHIVE_PATH / SKILL_REGRESSION_REPORT_PATH
 *      (paths overridable — testes hermeticos); OPS_TELEGRAM_CHAT_ID / TELEGRAM_BOT_TOKEN
 */

const fs = require('fs');
const path = require('path');
const {
  readArchive,
  writeArchive,
  mergeSnapshot,
  pruneArchive,
  buildRegressionReport,
  writeReport,
  notifyRegressions,
} = require('./lib/skillRegression');

const DEFAULT_SKILL_PATH = path.join(__dirname, '../public/data/forecast-skill.json');
const skillPath = process.env.FORECAST_SKILL_PATH || DEFAULT_SKILL_PATH;
const archivePath =
  process.env.SKILL_REGRESSION_ARCHIVE_PATH ||
  require('./lib/skillRegression').DEFAULT_ARCHIVE_PATH;
const reportPath =
  process.env.SKILL_REGRESSION_REPORT_PATH ||
  require('./lib/skillRegression').DEFAULT_REPORT_PATH;

async function main() {
  console.log('📈 Forecast-skill regression check — recente vs baseline por boia...');

  if (!fs.existsSync(skillPath)) {
    console.warn('⚠️ forecast-skill.json missing — sem skill para auditar (degradação graciosa, exit 0).');
    return { regressions: 0, reason: 'no-skill-file' };
  }

  let skill;
  try {
    skill = JSON.parse(fs.readFileSync(skillPath, 'utf-8'));
  } catch (err) {
    console.warn(`⚠️ forecast-skill.json parse failed: ${err.message} (exit 0).`);
    return { regressions: 0, reason: 'parse-failed' };
  }

  const byBuoy = skill.byBuoy && typeof skill.byBuoy === 'object' ? skill.byBuoy : {};
  const fetchedAt =
    typeof skill.fetchedAt === 'string' ? skill.fetchedAt : new Date().toISOString();

  const archive = readArchive(archivePath);
  const added = mergeSnapshot(archive, byBuoy, fetchedAt);
  pruneArchive(archive);
  writeArchive(archive, archivePath);

  const report = buildRegressionReport(archive);

  const total = Object.keys(report.byBuoy).length;
  const regressed = report.regressions.length;
  console.log(
    `   ${total} boias rastreadas · ${added} snapshot(s) novo(s) hoje · ${regressed} com regressão`,
  );
  for (const r of report.regressions) {
    console.warn(
      `   🔴 ${r.name} (${r.buoyId}): ${r.reasons.join(' · ')} — baseline RMSE ${r.baseline.rmse?.toFixed(2) ?? 'n/d'} m, recente ${r.recent.rmse?.toFixed(2) ?? 'n/d'} m`,
    );
  }
  if (regressed === 0) {
    console.log('   ✅ Sem regressões de skill (RMSE/|ME| dentro do limiar vs baseline).');
  }

  // Notifica ANTES de escrever o report — a transição lê o report anterior
  // (do run passado); se escrevêssemos primeiro, o novo report seria lido como
  // “já reportado” e a transição nunca dispararia.
  const res = await notifyRegressions(report, { reportPath });
  if (res.reason === 'no-regressions' || res.reason === 'already-reported') {
    // silencioso — sem mudança de estado
  } else {
    console.log(res.notified
      ? `   ✅ Telegram enviado (${res.newlyRegressed.join(', ')})`
      : `   ℹ️ Telegram: ${res.reason}`);
  }

  writeReport(report, reportPath);

  return { regressions: regressed, buoys: total };
}

const isDirectRun = require.main === module;
if (isDirectRun) {
  main().catch((err) => {
    console.error('❌ check-skill-regression failed:', err.message || err);
    process.exitCode = 1;
  });
}

module.exports = { main };
