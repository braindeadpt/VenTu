/**
 * Unified data-layer health-check for the workflow — ONE step that fails /
 * warns early when any optional data layer stays degraded for several
 * CONSECUTIVE runs.
 *
 * obs:update / update-conditions write, into pipeline-meta.json, the streak of
 * each layer (count of consecutive runs with status down/stale; reset on ok;
 * boias 'no-key' nunca conta). Este passo lê o meta committed e:
 *   - streak >= FAIL_AFTER  → ::error:: para as camadas afetadas + exit 1
 *     (o job falha — a camada esteve degradada horas sem ninguém notar);
 *   - streak >= WARN_AFTER  → ::warning:: + exit 0 (heads-up, pipeline segue);
 *   - caso contrário        → resumo ✅ por camada + exit 0.
 *
 * Substitui o check-buoy-layer-health.js: agora cobre também o radar IPMA e os
 * avisos IPMA/MeteoAlarm no mesmo passo (limiares globais env-overridable:
 * DATA_LAYER_WARN_AFTER / DATA_LAYER_FAIL_AFTER; por camada não é preciso —
 * o objetivo é falhar cedo quando QUALQUER camada degrada).
 *
 * Usage:
 *   node scripts/check-data-layer-health.js
 * Env: PIPELINE_META_ROOT (paths herméticos nos testes) /
 *      DATA_LAYER_WARN_AFTER / DATA_LAYER_FAIL_AFTER
 */

const fs = require('fs');
const path = require('path');
const {
  evaluateDataLayerHealth,
  DEFAULT_WARN_AFTER,
  DEFAULT_FAIL_AFTER,
} = require('./lib/dataLayerHealth.js');

const META_PATH =
  process.env.PIPELINE_META_ROOT
    ? path.join(process.env.PIPELINE_META_ROOT, 'public', 'data', 'pipeline-meta.json')
    : path.join(__dirname, '../public/data/pipeline-meta.json');

function readEnvInt(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isInteger(v) && v > 0 ? v : fallback;
}

function main() {
  const warnAfter = readEnvInt('DATA_LAYER_WARN_AFTER', DEFAULT_WARN_AFTER);
  const failAfter = readEnvInt('DATA_LAYER_FAIL_AFTER', DEFAULT_FAIL_AFTER);

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  } catch (err) {
    console.warn(`::warning::pipeline-meta.json ilegível (${err.message}) — a verificar no próximo run.`);
    process.exit(0);
  }

  const result = evaluateDataLayerHealth(meta, { warnAfter, failAfter });
  for (const line of result.failures) console.error(line);
  for (const line of result.warnings) console.warn(line);
  for (const line of result.oks) console.log(line);

  if (result.level === 'fail') process.exit(1);
  process.exit(0);
}

// Só corre como CLI; nos testes importa-se a função pura evaluateDataLayerHealth.
if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_WARN_AFTER,
  DEFAULT_FAIL_AFTER,
  main,
};