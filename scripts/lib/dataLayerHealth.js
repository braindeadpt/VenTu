/**
 * Data-layer health (radar IPMA + avisos IPMA/MeteoAlarm) — extends the buoy
 * layer streak pattern to the other optional data layers, for a SINGLE
 * workflow health-check step that fails/warns when any layer stays degraded
 * (down/stale) for several consecutive runs.
 *
 * Filas de dados cobertas (o streak é gravado em pipeline-meta.json por quem
 * escreve o meta — obs:update / update-conditions):
 *   - buoyLayer      (lib/buoyLayerHealth.js) — boias IH + fallback WMO.
 *   - radarLayer     (aqui) — frames de radar IPMA; ok quando o frame mais
 *     recente está fresco (≤ RADAR_MAX_AGE_MINUTES), stale quando existe mas
 *     é velho, down quando o ficheiro/frame falta.
 *   - warningsLayer  (aqui) — avisos IPMA/MeteoAlarm; ok quando fetchedAt está
 *     dentro da janela (≤ WARNINGS_MAX_AGE_HOURS), stale quando é velho mas
 *     existe, down quando o ficheiro falta. Um warnings.json vazio mas fresco
 *     é 'ok' (sem avisos activos é um estado legítimo).
 *
 * Espelha na pipeline o que os clientes/UI já fazem, para os logs do workflow
 * e a auditoria no pipeline-meta.json.
 */

const fs = require('fs');
const path = require('path');

/** Um frame de radar não deve ter mais de 25 min — o IPMA publica de 5 em 5. */
const RADAR_MAX_AGE_MINUTES = 25;
/** Avisos mudam devagar — fetchedAt com mais de 24 h conta como stale. */
const WARNINGS_MAX_AGE_HOURS = 24;
/** Avisos costeiros do IH mudam devagar (nav_warning_coastal) — mesma janela. */
const COASTAL_MAX_AGE_HOURS = 24;

const DEFAULT_WARN_AFTER = 3;
const DEFAULT_FAIL_AFTER = 6;

/** Camadas avaliadas pelo health-check unificado (ordem de apresentação). */
const LAYERS = [
  { key: 'buoyLayer', label: 'Boias (onda observada)' },
  { key: 'radarLayer', label: 'Radar IPMA' },
  { key: 'warningsLayer', label: 'Avisos IPMA/MeteoAlarm' },
];

function isoAgeHours(iso, nowMs) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (nowMs - t) / 3_600_000;
}

/** Derivação pura — estado da camada de radar. */
function deriveRadarLayerStatus(file, nowMs = Date.now()) {
  if (!file) return 'down';
  const frameTime = file.frameTime ?? file.frames?.[0]?.frameTime ?? null;
  if (!frameTime) return 'down';
  const ageMin = isoAgeHours(frameTime, nowMs) * 60;
  if (!Number.isFinite(ageMin) || ageMin < 0) return 'down';
  return ageMin <= RADAR_MAX_AGE_MINUTES ? 'ok' : 'stale';
}

/** Derivação pura — estado da camada de avisos. */
function deriveWarningsLayerStatus(file, nowMs = Date.now()) {
  if (!file) return 'down';
  const ageHours = isoAgeHours(file.fetchedAt, nowMs);
  if (ageHours == null || ageHours < 0) return 'down';
  return ageHours <= WARNINGS_MAX_AGE_HOURS ? 'ok' : 'stale';
}

/**
 * Derivação pura — estado da camada de avisos costeiros (IH). Semelhante aos
 * avisos: ok com fetchedAt fresco (≤ COASTAL_MAX_AGE_HOURS), stale quando o
 * ficheiro existe mas é velho, down sem ficheiro. Um ficheiro fresco sem
 * avisos é 'ok' (sem avisos em vigor é um estado legítimo).
 */
function deriveCoastalWarningsLayerStatus(file, nowMs = Date.now()) {
  if (!file) return 'down';
  const ageHours = isoAgeHours(file.fetchedAt, nowMs);
  if (ageHours == null || ageHours < 0) return 'down';
  return ageHours <= COASTAL_MAX_AGE_HOURS ? 'ok' : 'stale';
}

/**
 * Carrega radar.json e deriva o estado. Null quando o ficheiro falta (primeiro
 * run antes do fetch) — nesse caso não se deve acumular streak.
 * @param {string} [rootDir]
 * @param {number} [nowMs]
 * @returns {{ status: 'ok'|'down'|'stale', frameTime?: string } | null}
 */
function loadRadarLayerStatus(rootDir = path.join(__dirname, '..', '..'), nowMs = Date.now()) {
  let file;
  try {
    file = JSON.parse(fs.readFileSync(path.join(rootDir, 'public', 'data', 'radar.json'), 'utf-8'));
  } catch {
    return null;
  }
  const out = { status: deriveRadarLayerStatus(file, nowMs) };
  const frameTime = file.frameTime ?? file.frames?.[0]?.frameTime ?? null;
  if (typeof frameTime === 'string') out.frameTime = frameTime;
  return out;
}

/**
 * Carrega warnings.json e deriva o estado. Null quando o ficheiro falta.
 * @param {string} [rootDir]
 * @param {number} [nowMs]
 * @returns {{ status: 'ok'|'down'|'stale', fetchedAt?: string,
 *            source?: string, activeWarnings: number } | null}
 */
function loadWarningsLayerStatus(rootDir = path.join(__dirname, '..', '..'), nowMs = Date.now()) {
  let file;
  try {
    file = JSON.parse(fs.readFileSync(path.join(rootDir, 'public', 'data', 'warnings.json'), 'utf-8'));
  } catch {
    return null;
  }
  const out = {
    status: deriveWarningsLayerStatus(file, nowMs),
    activeWarnings: Array.isArray(file.warnings) ? file.warnings.length : 0,
    source: file.source,
  };
  if (typeof file.fetchedAt === 'string') out.fetchedAt = file.fetchedAt;
  return out;
}

/**
 * Carrega ih-coastal-warnings.json e deriva o estado. Null quando o ficheiro
 * falta (primeiro run antes do fetch).
 * @param {string} [rootDir]
 * @param {number} [nowMs]
 * @returns {{ status: 'ok'|'down'|'stale', fetchedAt?: string,
 *            activeWarnings: number, coveredSpots: number } | null}
 */
function loadCoastalWarningsLayerStatus(rootDir = path.join(__dirname, '..', '..'), nowMs = Date.now()) {
  let file;
  try {
    file = JSON.parse(fs.readFileSync(path.join(rootDir, 'public', 'data', 'ih-coastal-warnings.json'), 'utf-8'));
  } catch {
    return null;
  }
  const out = {
    status: deriveCoastalWarningsLayerStatus(file, nowMs),
    activeWarnings: Array.isArray(file.warnings) ? file.warnings.length : 0,
    coveredSpots: file.coverage && typeof file.coverage === 'object'
      ? Object.keys(file.coverage).length
      : 0,
  };
  if (typeof file.fetchedAt === 'string') out.fetchedAt = file.fetchedAt;
  // Estado da fonte ES cross-border (escrito pelo fetch como `esHealth`):
  // configured/disabled + status ok|error, com timestamps para o streak ES.
  if (file.esHealth && typeof file.esHealth === 'object') {
    const es = { configured: !!file.esHealth.configured };
    if (typeof file.esHealth.status === 'string') es.status = file.esHealth.status;
    if (typeof file.esHealth.lastOkAt === 'string') es.lastOkAt = file.esHealth.lastOkAt;
    if (typeof file.esHealth.lastErrorAt === 'string') es.lastErrorAt = file.esHealth.lastErrorAt;
    if (typeof file.esHealth.error === 'string') es.error = file.esHealth.error;
    out.es = es;
  }
  return out;
}

/**
 * Streak de runs consecutivas com a camada em 'down'/'stale' — mesmo padrão do
 * buoyLayer, genérico para as várias chaves. Puro: dado o estado actual e o
 * meta anterior (cujo streak viaja no ficheiro committed), devolve a camada
 * enriquecida com streak/lastStatus/lastOkAt. Null quando não há camada.
 * @param {object | null | undefined} layer
 * @param {object | null | undefined} prevMeta
 * @param {string} key chave no pipeline-meta (ex: 'radarLayer')
 * @returns {object | null}
 */
function applyLayerStreak(layer, prevMeta, key) {
  if (!layer) return null;
  const prev = prevMeta?.[key] ?? {};
  const bad = layer.status === 'down' || layer.status === 'stale';
  const prevStreak = Number(prev.streak);
  const streak = bad ? (Number.isFinite(prevStreak) ? prevStreak + 1 : 1) : 0;
  const lastOkAt = bad ? prev.lastOkAt ?? null : new Date().toISOString();
  const out = {
    ...layer,
    streak,
    lastStatus: layer.status,
    streakUpdatedAt: new Date().toISOString(),
  };
  if (lastOkAt) out.lastOkAt = lastOkAt;
  return out;
}

/**
 * Streak da fonte ES dos avisos costeiros (cross-border): mesma semântica do
 * applyLayerStreak, mas para o sub-estado `es` da camada costeira — conta runs
 * consecutivas em que o feed ES está configurado mas em erro. Puro.
 *
 * @param {object | null | undefined} layer camada costeira (com `es`)
 * @param {object | null | undefined} prevMeta meta anterior (carrega o streak)
 * @returns {object | null | undefined} layer com `es` enriquecido (streak)
 */
function applyCoastalEsStreak(layer, prevMeta) {
  if (!layer || !layer.es) return layer;
  const es = layer.es;
  if (!es.configured) {
    // Sem feed ES configurado — estado estático, sem streak nem alarme.
    return { ...layer, es: { ...es, streak: 0, lastStatus: 'disabled' } };
  }
  const bad = es.status !== 'ok';
  const prev = prevMeta?.coastalWarningsLayer?.es ?? {};
  const prevStreak = Number(prev.streak);
  const streak = bad ? (Number.isFinite(prevStreak) ? prevStreak + 1 : 1) : 0;
  const lastOkAt = bad ? prev.lastOkAt ?? es.lastOkAt ?? null : new Date().toISOString();
  const out = {
    ...layer,
    es: {
      ...es,
      streak,
      lastStatus: es.status,
      streakUpdatedAt: new Date().toISOString(),
    },
  };
  if (lastOkAt) out.es.lastOkAt = lastOkAt;
  return out;
}

/**
 * Monta a camada costeira completa para o pipeline-meta: streak da camada
 * (down/stale) + streak da fonte ES (cross-border). Conveniência para os dois
 * writers (obs:update / update-conditions).
 * @param {string} [rootDir]
 * @param {object | null | undefined} prevMeta
 * @param {number} [nowMs]
 * @returns {object | null}
 */
function buildCoastalWarningsLayer(rootDir = path.join(__dirname, '..', '..'), prevMeta, nowMs = Date.now()) {
  const layer = applyLayerStreak(
    loadCoastalWarningsLayerStatus(rootDir, nowMs),
    prevMeta,
    'coastalWarningsLayer',
  );
  if (!layer) return null;
  return applyCoastalEsStreak(layer, prevMeta);
}

/**
 * Avaliação unificada das camadas a partir do pipeline-meta. Pura (testável
 * sem CLI/disk). Cada camada com streak ≥ failAfter falha; ≥ warnAfter avisa;
 * o pior nível manda. Retorna os detalhes por camada (para o CLI imprimir) e
 * o nível agregado.
 * @param {object | null | undefined} meta
 * @param {{ warnAfter?: number, failAfter?: number }} [opts]
 * @returns {{ level: 'ok'|'warn'|'fail', warnAfter: number, failAfter: number,
 *            layers: Array<{ key: string, label: string, status: string|null,
 *                            streak: number }>,
 *            failures: string[], warnings: string[], oks: string[] }}
 */
function evaluateDataLayerHealth(meta, opts = {}) {
  const warnAfter = opts.warnAfter ?? DEFAULT_WARN_AFTER;
  const failAfter = opts.failAfter ?? DEFAULT_FAIL_AFTER;
  let level = 'ok';
  const failures = [];
  const warnings = [];
  const oks = [];

  for (const { key, label } of LAYERS) {
    const layer = meta?.[key] ?? {};
    const status = layer.status ?? null;
    const streak = Number.isFinite(Number(layer.streak)) ? Number(layer.streak) : 0;
    const suffix = layer.lastOkAt ? ` · última vez ok: ${layer.lastOkAt}` : '';

    if (streak >= failAfter) {
      level = 'fail';
      failures.push(
        `::error::${label} em '${status}' há ${streak} runs seguidas (limiar de falha: ${failAfter}${suffix}). ` +
          `Camada degradada há demasiado tempo sem ninguém ver — verificar a fonte/fetch.`,
      );
    } else if (streak >= warnAfter) {
      if (level !== 'fail') level = 'warn';
      warnings.push(
        `::warning::${label} em '${status}' há ${streak} runs seguidas (limiar de aviso: ${warnAfter} · de falha: ${failAfter}${suffix}). Continuando — falha automática a partir de ${failAfter} runs.`,
      );
    } else {
      oks.push(`✅ ${label}: '${status}' · streak down/stale: ${streak} (limiares ${warnAfter}/${failAfter}).`);
    }
  }

  // Fonte ES dos avisos costeiros (cross-border «Avisos a los navegantes»):
  // quando ES_NAV_WARNINGS_URL está configurada mas o feed devolve erros
  // repetidos (ou o esSourceNote/esHealth marca degradação), avisa com o mesmo
  // limiar de runs — um erro isolado (streak < warnAfter) não falha o CI.
  const coastal = meta?.coastalWarningsLayer ?? {};
  const es = coastal.es;
  if (es && es.configured && es.status && es.status !== 'ok') {
    const esStreak = Number.isFinite(Number(es.streak)) ? Number(es.streak) : 1;
    const suffix = es.lastOkAt ? ` · última vez ok: ${es.lastOkAt}` : '';
    const detail = es.error ? ` (${es.error})` : '';
    if (esStreak >= failAfter) {
      level = 'fail';
      failures.push(
        `::error::Avisos ES (Avisos a los navegantes) em erro há ${esStreak} runs seguidas (limiar de falha: ${failAfter}${suffix})${detail}. Feed ES_NAV_WARNINGS_URL degradado — verificar a fonte espanhola.`,
      );
    } else if (esStreak >= warnAfter) {
      if (level !== 'fail') level = 'warn';
      warnings.push(
        `::warning::Avisos ES (Avisos a los navegantes) em erro há ${esStreak} runs seguidas (limiar de aviso: ${warnAfter} · de falha: ${failAfter}${suffix})${detail}. Continuando — falha automática a partir de ${failAfter} runs.`,
      );
    } else {
      oks.push(
        `✅ Avisos ES (cross-border): '${es.status}' há ${esStreak} run(s) (limiares ${warnAfter}/${failAfter}${suffix}).`,
      );
    }
  } else if (es && es.configured) {
    oks.push(`✅ Avisos ES (cross-border): feed ok${es.lastOkAt ? ` · última vez ok: ${es.lastOkAt}` : ''}.`);
  }

  return {
    level,
    warnAfter,
    failAfter,
    layers: LAYERS.map(({ key, label }) => ({
      key,
      label,
      status: meta?.[key]?.status ?? null,
      streak: Number.isFinite(Number(meta?.[key]?.streak)) ? Number(meta?.[key]?.streak) : 0,
    })),
    failures,
    warnings,
    oks,
  };
}

module.exports = {
  RADAR_MAX_AGE_MINUTES,
  WARNINGS_MAX_AGE_HOURS,
  COASTAL_MAX_AGE_HOURS,
  DEFAULT_WARN_AFTER,
  DEFAULT_FAIL_AFTER,
  deriveRadarLayerStatus,
  deriveWarningsLayerStatus,
  deriveCoastalWarningsLayerStatus,
  loadRadarLayerStatus,
  loadWarningsLayerStatus,
  loadCoastalWarningsLayerStatus,
  applyLayerStreak,
  applyCoastalEsStreak,
  buildCoastalWarningsLayer,
  evaluateDataLayerHealth,
};