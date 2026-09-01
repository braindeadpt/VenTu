/**
 * Buoy layer health (server side) — mirror of src/lib/buoyLayerHealth.ts so
 * the pipeline can record the SAME status the UI derives into
 * pipeline-meta.json, for workflow logs and diagnostics.
 *
 * IH status values:
 *   - 'no-key' — IH_API_KEY not configured in the pipeline (stations only).
 *   - 'down'   — key configured but the IH wave API returned no snapshots.
 *   - 'stale'  — snapshots exist but every active reading is older than the
 *                freshness gate (3h IH); the UI card would hide itself.
 *   - 'ok'     — fresh readings available.
 *
 * WMO status values (keyless Copernicus fallback):
 *   - 'down'   — no file, no buoys, or hasWaveData false (fallback dead).
 *   - 'stale'  — buoys exist but every reading is older than the 6h gate.
 *   - 'ok'     — at least one fresh reading.
 */
const fs = require('fs');
const path = require('path');

/** Max age (h) before a snapshot counts as stale — mirrors the data layer. */
const BUOY_READING_MAX_AGE_HOURS = 3;
/** WMO/Copernicus gate is wider (6h) because NRT ingestion lags hours. */
const WMO_READING_MAX_AGE_HOURS = 6;

/**
 * Boia Fugro nacional cujo observedWave cobre a Costa de Prata: Nazaré
 * Costeira (idEst 2, CSA88/2, WMO 6200199). getDatawellData serve hoje a
 * família Datawell mas pode rejeitar/sem servenv  Fugro — quando isso acontece
 * a Costa de Prata perde a fonte IH nacional mesmo que as Datawell continuem
 * frescas (por isso o status GLOBAL pode estar 'ok' com esta sub-camada morta).
 */
const FUGRO_NAZARE_KEY = '2';
const FUGRO_FAMILY = 'fugro';

function isoAgeHours(iso, nowMs) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (nowMs - t) / 3_600_000;
}

/**
 * Pure derivation of the Fugro (Nazaré Costeira) observedWave sub-state — the
 * national source the Costa de Prata/Lisboa spots depend on. Distinct from the
 * OVERALL DeriveBuoyLayerStatus: that one is 'ok' when ANY fresh active station
 * exists, so a rejected Fugro family can hide behind fresh Datawell buoys.
 *
 * @param {object | null | undefined} file parsed ih-buoys.json
 * @param {number} [nowMs]
 * @returns {{ status: 'ok' | 'rejected' | 'no-key' | 'missing',
 *             name?: string, latestReadingAt?: string, waveHeightM?: number } | null}
 *   - 'ok'       — leitura fresca (≤ BUOY_READING_MAX_AGE_HOURS) do Fugro 2;
 *   - 'rejected' — key configurada mas sem leitura fresca → getDatawellData
 *                  rejeitou/não serviu a família Fugro (marca observedWave da
 *                  Costa de Prata em falta na rota IH);
 *   - 'no-key'   — IH_API_KEY não configurada (nada a validar);
 *   - 'missing'  — key configurada mas a estação Fugro 2 não está activa no
 *                  catálogo (inactiva/ausente — não a rejecção do serviço).
 *   Devolve null quando não há ficheiro/estações.
 */
function deriveFugroState(file, nowMs = Date.now()) {
  if (!file || !file.stations) return null;
  if (file.apiKeyConfigured !== true) return { status: 'no-key' };
  const station = file.stations[FUGRO_NAZARE_KEY];
  if (!station || station.family !== FUGRO_FAMILY) {
    return { status: 'missing' };
  }
  const inactive = station.status === 'inactive' || station.status === 'inativa';
  if (inactive) return { status: 'missing', name: station.name };
  const latest = station.latest;
  const waveHeightM = latest ? Number(latest.hm0) : NaN;
  if (!latest || !Number.isFinite(waveHeightM)) {
    return { status: 'rejected', name: station.name };
  }
  const age = isoAgeHours(latest.date ?? station.lastSea, nowMs);
  if (age === null || age < 0 || age > BUOY_READING_MAX_AGE_HOURS) {
    return { status: 'rejected', name: station.name };
  }
  return {
    status: 'ok',
    name: station.name,
    latestReadingAt: latest.date,
    waveHeightM,
  };
}

/**
 * Pure derivation — same rules as the client (testable without fetch/disk).
 * @param {object | null | undefined} file parsed ih-buoys.json
 * @param {number} [nowMs]
 * @returns {'ok' | 'no-key' | 'down' | 'stale'}
 */
function deriveBuoyLayerStatus(file, nowMs = Date.now()) {
  if (!file || !file.stations) return 'no-key';
  if (file.apiKeyConfigured === false) return 'no-key';
  if (!file.hasWaveData) return 'down';

  // Snapshots exist — are any of them fresh? Use the newest reading across
  // active stations (inactive buoys with old lastSea must not trigger).
  let newest = Infinity;
  for (const st of Object.values(file.stations)) {
    if (st.status === 'inactive' || st.status === 'inativa') continue;
    const age = isoAgeHours(st.latest?.date ?? st.lastSea, nowMs);
    if (age !== null && age >= 0 && age < newest) newest = age;
  }
  if (!Number.isFinite(newest)) return 'down';
  return newest <= BUOY_READING_MAX_AGE_HOURS ? 'ok' : 'stale';
}

/**
 * Pure WMO/Copernicus derivation (keyless fallback) — mirrors the client.
 * @param {object | null | undefined} file parsed wmo-buoys.json
 * @param {number} [nowMs]
 * @returns {'ok' | 'down' | 'stale'}
 */
function deriveWmoLayerStatus(file, nowMs = Date.now()) {
  if (!file || !file.buoys) return 'down';
  if (!file.hasWaveData) return 'down';

  let newest = Infinity;
  for (const buoy of Object.values(file.buoys)) {
    const age = isoAgeHours(buoy.latest?.date, nowMs);
    if (age !== null && age >= 0 && age < newest) newest = age;
  }
  if (!Number.isFinite(newest)) return 'down';
  return newest <= WMO_READING_MAX_AGE_HOURS ? 'ok' : 'stale';
}

/**
 * Newest reading timestamp across WMO buoys (for diagnostics).
 */
function newestWmoReadingAt(file) {
  let newestTs = -Infinity;
  for (const buoy of Object.values(file?.buoys ?? {})) {
    const t = new Date(buoy.latest?.date).getTime();
    if (Number.isFinite(t) && t > newestTs) newestTs = t;
  }
  return Number.isFinite(newestTs) && newestTs > -Infinity
    ? new Date(newestTs).toISOString()
    : undefined;
}

/**
 * Load ih-buoys.json + wmo-buoys.json from the pipeline output dir and derive
 * the layer health (both sources), for pipeline-meta.json and logs.
 * @param {string} [rootDir]
 * @param {number} [nowMs]
 * @returns {{ status: 'ok'|'no-key'|'down'|'stale', apiKeyConfigured: boolean,
 *            hasWaveData: boolean, newestReadingAt?: string,
 *            wmo: { status: 'ok'|'down'|'stale', hasWaveData: boolean,
 *                   newestReadingAt?: string } } | null}
 *         null when ih-buoys.json is absent (first run before the buoy fetch).
 */
function loadBuoyLayerStatus(rootDir = path.join(__dirname, '..', '..'), nowMs = Date.now()) {
  const filePath = path.join(rootDir, 'public', 'data', 'ih-buoys.json');
  let file;
  try {
    file = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }

  const status = deriveBuoyLayerStatus(file, nowMs);
  // Newest active reading (same walk as the derivation) for diagnostics.
  let newestReadingAt;
  {
    let newestTs = -Infinity;
    for (const st of Object.values(file.stations ?? {})) {
      if (st.status === 'inactive' || st.status === 'inativa') continue;
      const t = new Date(st.latest?.date ?? st.lastSea).getTime();
      if (Number.isFinite(t) && t > newestTs) newestTs = t;
    }
    if (Number.isFinite(newestTs) && newestTs > -Infinity) {
      newestReadingAt = new Date(newestTs).toISOString();
    }
  }

  // WMO fallback — same walk as the client. Missing file → 'down'.
  let wmoFile;
  try {
    wmoFile = JSON.parse(fs.readFileSync(path.join(rootDir, 'public', 'data', 'wmo-buoys.json'), 'utf-8'));
  } catch {
    wmoFile = null;
  }
  const wmoStatus = deriveWmoLayerStatus(wmoFile, nowMs);
  const wmo = {
    status: wmoStatus,
    hasWaveData: wmoFile?.hasWaveData === true,
    ...(newestWmoReadingAt(wmoFile) ? { newestReadingAt: newestWmoReadingAt(wmoFile) } : {}),
  };

  const fugro = deriveFugroState(file, nowMs);

  return {
    status,
    apiKeyConfigured: file.apiKeyConfigured === true,
    hasWaveData: file.hasWaveData === true,
    ...(newestReadingAt ? { newestReadingAt } : {}),
    ...(fugro ? { fugro } : {}),
    wmo,
  };
}

/**
 * Consecutive-run streak of a DEGRADED buoy layer (status 'down' | 'stale') —
 * for the workflow health-check. Pure: given the current layer status and the
 * PREVIOUS pipeline-meta (whose buoyLayer.streak travels with the committed
 * file), returns the enriched layer with:
 *   - streak — +1 por run consecutiva em down/stale; 0 quando ok/no-key;
 *   - lastStatus — o estado que produziu o streak actual;
 *   - lastOkAt — quando a camada esteve ok pela última vez (mantido em down).
 *
 * 'no-key' NÃO conta como degradação (é o estado configurado sem key — o
 * setup keyless actual nunca deve acumular streak nem falhar o job).
 *
 * @param {object | null | undefined} buoyLayer from loadBuoyLayerStatus
 * @param {object | null | undefined} prevMeta previous pipeline-meta.json
 * @returns {object | null} enriched buoyLayer (null quando não há layer)
 */
function applyBuoyLayerStreak(buoyLayer, prevMeta) {
  if (!buoyLayer) return null;
  const prev = prevMeta?.buoyLayer ?? {};
  const bad = buoyLayer.status === 'down' || buoyLayer.status === 'stale';
  const prevStreak = Number(prev.streak);
  const streak = bad
    ? (Number.isFinite(prevStreak) ? prevStreak + 1 : 1)
    : 0;
  const lastOkAt = bad ? prev.lastOkAt ?? null : new Date().toISOString();
  const out = {
    ...buoyLayer,
    streak,
    lastStatus: buoyLayer.status,
    streakUpdatedAt: new Date().toISOString(),
  };
  if (lastOkAt) out.lastOkAt = lastOkAt;

  // Sub-camada Fugro (Costa de Prata): runs consecutivas em 'rejected' — para o
  // health-check avisar/escalar quando a getDatawellData rejeita a família
  // Fugro, mesmo que o status global esteja 'ok' (Datawell fresca). Reset em
  // qualquer outro estado (ok/no-key/missing).
  const fugroRejected = buoyLayer.fugro?.status === 'rejected';
  const prevFugroStreak = Number(prev.fugroRejectedStreak);
  out.fugroRejectedStreak = fugroRejected
    ? (Number.isFinite(prevFugroStreak) ? prevFugroStreak + 1 : 1)
    : 0;

  return out;
}

module.exports = {
  BUOY_READING_MAX_AGE_HOURS,
  WMO_READING_MAX_AGE_HOURS,
  deriveBuoyLayerStatus,
  deriveWmoLayerStatus,
  deriveFugroState,
  loadBuoyLayerStatus,
  applyBuoyLayerStreak,
  FUGRO_NAZARE_KEY,
  FUGRO_FAMILY,
};
