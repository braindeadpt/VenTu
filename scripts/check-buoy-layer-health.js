/**
 * Buoy layer health-check for the workflow — fails/ warns early when the
 * observed-wave layer stays degraded ('down' | 'stale') for several
 * CONSECUTIVE runs.
 *
 * merge-observations.mjs / update-conditions.js write, into pipeline-meta.json,
 * `buoyLayer.streak` — the count of consecutive runs with status down/stale
 * (reset on 'ok'/'no-key'; 'no-key' never counts as degradation). This step
 * reads the committed meta and:
 *   - streak >= FAIL_AFTER  → ::error:: + exit 1 (job fails — the layer has
 *     been down/stale for hours without anyone noticing);
 *   - streak >= WARN_AFTER  → ::warning:: + exit 0 (heads-up, pipeline continues);
 *   - otherwise             → OK summary.
 *
 * Fugro / Costa de Prata step: besides the overall down/stale streak, the meta
 * also carries `buoyLayer.fugro` + `buoyLayer.fugroRejectedStreak` — when the
 * key is configured but getDatawellData rejects the Fugro family (Nazaré
 * Costeira), the Costa de Prata loses its IH observed wave even while Datawell
 * buoys stay fresh (so OVERALL status can be 'ok'). This step warns on the
 * first rejected run and escalates to fail once the Fugro streak reaches
 * FAIL_AFTER, marking the Costa de Prata observedWave state.
 *
 * Defaults: warn after 3 runs (~3 h hourly), fail after 6 runs (~6 h).
 * Override via BUOY_LAYER_WARN_AFTER / BUOY_LAYER_FAIL_AFTER.
 */

const fs = require('fs');
const path = require('path');

const META_PATH =
  process.env.PIPELINE_META_ROOT
    ? path.join(process.env.PIPELINE_META_ROOT, 'public', 'data', 'pipeline-meta.json')
    : path.join(__dirname, '../public/data/pipeline-meta.json');

const DEFAULT_WARN_AFTER = 3;
const DEFAULT_FAIL_AFTER = 6;

function readEnvInt(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isInteger(v) && v > 0 ? v : fallback;
}

/**
 * Pure: decide the health level from a pipeline-meta payload.
 * @param {object | null | undefined} meta parsed pipeline-meta.json
 * @param {{ warnAfter?: number, failAfter?: number }} [opts]
 * @returns {{ level: 'ok' | 'warn' | 'fail', streak: number,
 *            status: string | null, warnAfter: number, failAfter: number,
 *            lines: string[] }} lines = mensagens para ::warning::/::error::
 */
function evaluateBuoyLayerHealth(meta, opts = {}) {
  const warnAfter = opts.warnAfter ?? DEFAULT_WARN_AFTER;
  const failAfter = opts.failAfter ?? DEFAULT_FAIL_AFTER;
  const layer = meta?.buoyLayer ?? {};
  const status = layer.status ?? null;
  const streak = Number.isFinite(Number(layer.streak)) ? Number(layer.streak) : 0;

  const base =
    `Camada de boias em '${status}' há ${streak} runs seguidas ` +
    `(limiar de aviso: ${warnAfter} · de falha: ${failAfter})` +
    (layer.lastOkAt ? ` · última vez ok: ${layer.lastOkAt}` : '') +
    (layer.newestReadingAt ? ` · última leitura: ${layer.newestReadingAt}` : '');

  // ── Passo Fugro (Costa de Prata) ─────────────────────────────────────────
  // Com a key configurada mas getDatawellData a rejeitar a família Fugro, a
  // Costa de Prata perde a onda observada IH nacional mesmo quando as boias
  // Datawell continuam frescas (status global 'ok'). A fallback keyless
  // Copernicus WMO 6200199 cobre a costa central, pelo que é um AVISO (exit 0)
  // — mas persiste até FAIL_AFTER runs e falha como uma degradação normal.
  const fugro = layer.fugro ?? {};
  const fugroRejected = fugro.status === 'rejected';
  const fugroStreak = Number.isFinite(Number(layer.fugroRejectedStreak))
    ? Number(layer.fugroRejectedStreak)
    : 0;
  const fugroLine = fugroRejected
    ? `Costa de Prata sem observedWave IH (família Fugro ${fugro.name ?? 'Nazaré Costeira'} rejeitada ` +
      `pela getDatawellData) há ${fugroStreak} run(s) — a fallback keyless Copernicus WMO 6200199 ` +
      `cobre a costa central, mas a fonte nacional IH fica em falta.`
    : null;
  // Efectivo: a rejecção Fugro soma ao streak de degradação para escalar.
  const effectiveStreak = fugroRejected && fugroStreak > streak ? fugroStreak : streak;

  if (effectiveStreak >= failAfter) {
    return {
      level: 'fail',
      streak,
      status,
      warnAfter,
      failAfter,
      lines: fugroRejected
        ? [
            base,
            `${fugroLine} Esta sub-camada está degradada há demasiado tempo — ` +
              'verificar a IH_API_KEY e se getDatawellData serve a família Fugro (docs/IH_API_KEY.md).',
          ]
        : [
            `${base}. A onda observada está degradada há demasiado tempo — ` +
              'verificar a IH_API_KEY (401 falha já no fetch), a API do IH e a fallback WMO/Copernicus.',
          ],
    };
  }
  if (effectiveStreak >= warnAfter) {
    return {
      level: 'warn',
      streak,
      status,
      warnAfter,
      failAfter,
      lines: fugroRejected
        ? [base, `${fugroLine}. Continuando — falha automática a partir de ${failAfter} runs.`]
        : [`${base}. Continuando — falha automática a partir de ${failAfter} runs.`],
    };
  }
  // ok por streak — mas uma rejecção Fugro activa é sempre um aviso (exit 0).
  if (fugroRejected) {
    return {
      level: 'warn',
      streak,
      status,
      warnAfter,
      failAfter,
      lines: [`${fugroLine} Continuando — falha automática a partir de ${failAfter} runs de rejecção.`],
    };
  }
  return {
    level: 'ok',
    streak,
    status,
    warnAfter,
    failAfter,
    lines: [`Camada de boias: '${status}' · streak down/stale: ${streak} (limiares ${warnAfter}/${failAfter}).`],
  };
}

function main() {
  const warnAfter = readEnvInt('BUOY_LAYER_WARN_AFTER', DEFAULT_WARN_AFTER);
  const failAfter = readEnvInt('BUOY_LAYER_FAIL_AFTER', DEFAULT_FAIL_AFTER);

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  } catch (err) {
    console.warn(`::warning::pipeline-meta.json ilegível (${err.message}) — a verificar no próximo run.`);
    process.exit(0);
  }

  const result = evaluateBuoyLayerHealth(meta, { warnAfter, failAfter });
  if (result.level === 'fail') {
    for (const line of result.lines) console.error(`::error::${line}`);
    process.exit(1);
  }
  if (result.level === 'warn') {
    for (const line of result.lines) console.warn(`::warning::${line}`);
  } else {
    console.log(`✅ ${result.lines[0]}`);
  }
  process.exit(0);
}

// Só corre como CLI; nos testes importa-se a função pura evaluateBuoyLayerHealth.
if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_WARN_AFTER,
  DEFAULT_FAIL_AFTER,
  evaluateBuoyLayerHealth,
  main,
};
