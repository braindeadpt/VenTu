/**
 * Verify the MeteoAlarm warnings layer after fetch-ipma-warnings.js — fails
 * the job (WITH a token) when warnings.json ends up `source: 'meteoalarm'`
 * but carries NO warnings. Mirrors verify-ih-buoy-layer.js.
 *
 * Rationale: `fetch-ipma-warnings.js` fala para o MeteoAlarm (EUMETNET) quando
 * a API do IPMA está em baixo; se o fallback também devolviver zero avisos, o
 * warnings.json fica `source: 'meteoalarm'` com `warnings: []` — uma dupla
 * falha (primary down + fallback sem conteúdo) que deixa a camada de segurança
 * vazia. Este gate falha o job nesse estado em vez de ship silenciosamente
 * avisos vazios por cima de spots.
 *
 * Enforced check (only meaningful WITH a token — the workflow runs this step
 * only when METEOALARM_API_KEY is set):
 *   `source === 'meteoalarm'` AND `warnings.length === 0` → fail. Qualquer
 *   outro caso (source 'ipma', ou meteoalarm com avisos) → OK.
 *
 * Exit 0 = OK · exit 1 = ::error:: com diagnóstico (o job falha no passo).
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_PATH =
  process.env.IPMA_WARNINGS_OUTPUT_PATH ||
  path.join(__dirname, '../public/data/warnings.json');

/** Source emitido pelo fallback MeteoAlarm (fetch-meteoalarm-warnings.js). */
const METEOALARM_SOURCE = 'meteoalarm';

/**
 * Pure: verifica a camada de avisos MeteoAlarm num payload de warnings.json.
 * @param {object | null | undefined} data
 * @returns {{ ok: boolean, problems: string[], source: string | null,
 *            warningCount: number }}
 */
function verifyMeteoAlarmLayer(data) {
  const source = data?.source ?? null;
  const count = Array.isArray(data?.warnings) ? data.warnings.length : 0;
  const problems = [];
  if (source === METEOALARM_SOURCE && count === 0) {
    problems.push(
      `warnings.json ficou source:"meteoalarm" mas sem avisos activos (warnings.length=0). ` +
        'Diagnóstico: o IPMA estava em baixo e o fallback MeteoAlarm também não devolveu avisos — ' +
        'a camada de segurança (Agitação Marítima/Vento) está vazia por cima dos spots. ' +
        'Ver docs/METEOALARM_API_KEY.md e o estado da API IPMA/EUMETNET.',
    );
  }
  return { ok: problems.length === 0, problems, source, warningCount: count };
}

function main() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
  } catch (err) {
    console.error(`::error::warnings.json ilegível: ${err.message}`);
    process.exit(1);
  }

  const { ok, problems, source, warningCount } = verifyMeteoAlarmLayer(data);
  if (!ok) {
    for (const p of problems) console.error(`::error::${p}`);
    process.exit(1);
  }

  if (source === METEOALARM_SOURCE) {
    console.log(
      `✅ MeteoAlarm warnings layer OK — source: meteoalarm · ${warningCount} aviso(s) activo(s).`,
    );
  } else {
    console.log(`✅ Avisos OK — source: ${source ?? '?'} · a camada não depende do fallback MeteoAlarm (${warningCount} avisos).`);
  }
}

// Só corre como CLI; nos testes importa-se a função pura verifyMeteoAlarmLayer.
if (require.main === module) {
  main();
}

module.exports = { verifyMeteoAlarmLayer, METEOALARM_SOURCE, main };