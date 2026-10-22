/**
 * Verify the MeteoAlarm warnings layer after fetch-ipma-warnings.js — detects
 * (WITH a token) when warnings.json ends up `source: 'meteoalarm'` but carries
 * NO warnings.
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
 * Em falha (dupla falha IPMA + MeteoAlarm vazio, ou ficheiro ilegível): repõe o
 * warnings.json ANTERIOR (o do commit do checkout — `git show HEAD:…`, ou
 * IPMA_WARNINGS_PREVIOUS_PATH), sem os avisos já expirados, marcado
 * `stale: true` (+ staleSince/staleReason), emite ::warning:: e sai 0.
 * Antes falhava o job (exit 1): um pipeline inteiro (condições, marés, boias)
 * ficava por publicar por causa de UMA camada — e os avisos vazios que o gate
 * queria evitar continuavam no live, agora sem dados frescos à volta.
 *
 * Exit 0 sempre; o alarme é o ::warning:: (anotação no run) e o `stale`.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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

const notExpired = (nowMs) => (w) => {
  const end = w && w.endTime ? Date.parse(w.endTime) : NaN;
  return !Number.isFinite(end) || end > nowMs;
};

/**
 * Pure: payload a repor a partir do warnings.json anterior — avisos expirados
 * fora, marcado stale. Null quando não há anterior utilizável.
 * @param {object | null | undefined} prev
 * @param {{ now?: Date; reason: string }} opts
 */
function restorePreviousWarnings(prev, opts) {
  if (!prev || typeof prev !== 'object' || !Array.isArray(prev.warnings)) return null;
  const now = opts.now || new Date();
  const keep = notExpired(now.getTime());
  const spotWarnings = {};
  for (const [id, list] of Object.entries(prev.spotWarnings || {})) {
    const l = Array.isArray(list) ? list.filter(keep) : [];
    if (l.length) spotWarnings[id] = l;
  }
  return {
    ...prev,
    warnings: prev.warnings.filter(keep),
    spotWarnings,
    stale: true,
    staleSince: prev.stale && prev.staleSince ? prev.staleSince : now.toISOString(),
    staleReason: opts.reason,
  };
}

function readPrevious() {
  const override = process.env.IPMA_WARNINGS_PREVIOUS_PATH;
  try {
    if (override) return JSON.parse(fs.readFileSync(override, 'utf8'));
    const root = path.join(__dirname, '..');
    const rel = path.relative(root, OUTPUT_PATH).split(path.sep).join('/');
    return JSON.parse(execFileSync('git', ['show', `HEAD:${rel}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
}

function degrade(reason) {
  console.log(`::warning::Avisos: ${reason}`);
  const restored = restorePreviousWarnings(readPrevious(), { reason });
  if (!restored) {
    console.log('::warning::Avisos: sem warnings.json anterior utilizável — fica o actual (o pipeline continua).');
    return;
  }
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(restored, null, 2)}\n`);
  console.log(
    `↩️ warnings.json anterior reposto (source: ${restored.source ?? '?'}, ${restored.warnings.length} aviso(s) ainda válidos) — stale desde ${restored.staleSince}.`,
  );
}

function main() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
  } catch (err) {
    degrade(`warnings.json ilegível (${err.message})`);
    return;
  }

  const { ok, problems, source, warningCount } = verifyMeteoAlarmLayer(data);
  if (!ok) {
    for (const p of problems) console.log(`::warning::${p}`);
    degrade('IPMA em baixo e fallback MeteoAlarm vazio');
    return;
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

module.exports = { verifyMeteoAlarmLayer, restorePreviousWarnings, METEOALARM_SOURCE, main };