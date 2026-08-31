#!/usr/bin/env node
/**
 * Validates the freshly generated public/data files after the pipeline —
 * schema + TTL — before the commit/push (update-data.yml job `validate-data`).
 * No build: data guarantees only.
 *
 * Mode-aware: `full` runs also check the Open-Meteo TTL backstop (reusing the
 * STALE_* constants from scripts/lib/updateSchedule.js); `observations` runs
 * only check the fields that an obs run refreshes; `skip` does nothing.
 *
 * Usage:
 *   node scripts/validate-generated-data.js [--mode full|observations|skip]
 * Env: VENTU_MODE overrides --mode; VENTU_DATA_DIR overrides the data root
 * (used by tests — the default is ./public/data).
 */

const fs = require('fs');
const path = require('path');

const DATA =
  process.env.VENTU_DATA_DIR || path.join(__dirname, '..', 'public', 'data');

const args = process.argv.slice(2);
const fromArg = (args.find((a) => a.startsWith('--mode=')) || '').split('=')[1];
const MODE = ['full', 'observations', 'skip'].includes(fromArg || process.env.VENTU_MODE)
  ? fromArg || process.env.VENTU_MODE
  : 'full';

if (MODE === 'skip') {
  console.log('⏭  validate-generated-data: mode=skip — nothing to validate');
  process.exit(0);
}

const { STALE_FULL_HOURS_DAY, STALE_FULL_HOURS_NIGHT, getLisbonParts } = require('./lib/updateSchedule');
const { findUnmappedEsBuoys } = require('./lib/copernicusBuoys.js');

const errors = [];
const warnings = [];
const checks = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);
const check = (name, cond, detail) => {
  checks.push(name);
  if (!cond) fail(`${name}: ${detail}`);
};

const read = (p) => {
  const file = path.join(DATA, p);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};
const isIso = (s) =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s));
const ageHours = (iso) => (Date.now() - new Date(iso).getTime()) / 3600000;

// ── 1. pipeline-meta.json — the run ledger ──
const meta = read('pipeline-meta.json');
check('pipeline-meta', meta !== undefined, 'file missing');
if (meta !== undefined) {
  for (const k of ['lastRunAt', 'lastRunMode', 'observationsUpdatedAt', 'fullUpdatedAt', 'displayUpdatedAt']) {
    check(`pipeline-meta.${k}`, meta[k] !== undefined, `required key missing`);
  }
  check('pipeline-meta.lastRunMode', ['full', 'observations'].includes(meta.lastRunMode),
    `unexpected mode "${meta.lastRunMode}"`);
  for (const k of ['lastRunAt', 'observationsUpdatedAt', 'fullUpdatedAt', 'displayUpdatedAt']) {
    if (meta[k] !== undefined) {
      check(`pipeline-meta.${k}.iso`, isIso(meta[k]), `not an ISO timestamp: "${meta[k]}"`);
    }
  }
}

// ── 2. conditions.json — spot-slug → condition object ──
const conditions = read('conditions.json');
check('conditions', conditions !== undefined, 'file missing');
if (conditions !== undefined) {
  check('conditions.shape', typeof conditions === 'object' && conditions !== null && !Array.isArray(conditions),
    'must be an object keyed by spot slug');
  const slugs = Object.keys(conditions);
  check('conditions.nonEmpty', slugs.length > 0, 'no spots');
  const bad = slugs.filter((s) => {
    const v = conditions[s];
    return typeof v !== 'object' || v === null || typeof v.waveHeight !== 'number';
  });
  check('conditions.entries', bad.length === 0, `${bad.length} spot(s) without a numeric waveHeight`);
}

// ── 3. forecasts.json + forecasts/<slug>.json — hourly arrays ──
const forecasts = read('forecasts.json');
check('forecasts', forecasts !== undefined, 'file missing');
const FORECAST_MIN_HOURS = 24;
let forecastFiles = [];
if (fs.existsSync(path.join(DATA, 'forecasts'))) {
  forecastFiles = fs.readdirSync(path.join(DATA, 'forecasts'))
    .filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
}
if (forecasts !== undefined) {
  check('forecasts.shape', typeof forecasts === 'object' && !Array.isArray(forecasts), 'must be an object');
  const keys = Object.keys(forecasts);
  check('forecasts.nonEmpty', keys.length > 0, 'no spots');
  for (const k of keys) {
    const arr = forecasts[k];
    check(`forecasts.${k}.shape`, Array.isArray(arr) && arr.length >= FORECAST_MIN_HOURS,
      `expected array of ≥${FORECAST_MIN_HOURS} hours`);
    if (Array.isArray(arr)) {
      const bad = arr.filter((h) => !h || !isIso(h.time) || typeof h.waveHeight !== 'number' || typeof h.windSpeed !== 'number');
      check(`forecasts.${k}.entries`, bad.length === 0,
        `${bad.length} hour(s) missing time/waveHeight/windSpeed`);
    }
  }
  // split-file integrity: every key has a file and vice versa
  const noFile = keys.filter((k) => !forecastFiles.includes(k));
  const orphan = forecastFiles.filter((f) => !keys.includes(f));
  check('forecasts.splitFiles', noFile.length === 0 && orphan.length === 0,
    `${noFile.length} key(s) without file, ${orphan.length} file(s) without key`);
  for (const f of forecastFiles) {
    const arr = read(`forecasts/${f}.json`);
    check(`forecasts/${f}.shape`, Array.isArray(arr) && arr.length >= FORECAST_MIN_HOURS,
      `expected array of ≥${FORECAST_MIN_HOURS} hours`);
    if (Array.isArray(arr)) {
      const bad = arr.filter((h) => !h || !isIso(h.time) || typeof h.waveHeight !== 'number' || typeof h.windSpeed !== 'number');
      check(`forecasts/${f}.entries`, bad.length === 0,
        `${bad.length} hour(s) missing time/waveHeight/windSpeed`);
    }
  }
}

// ── 4. Cross-file integrity: conditions and forecasts cover the same spots ──
if (conditions !== undefined && forecasts !== undefined) {
  const cKeys = Object.keys(conditions);
  const fKeys = Object.keys(forecasts);
  const onlyC = cKeys.filter((k) => !fKeys.includes(k));
  const onlyF = fKeys.filter((k) => !cKeys.includes(k));
  check('crossFile.spotSets', onlyC.length === 0 && onlyF.length === 0,
    `spot set mismatch: ${onlyC.length} only in conditions, ${onlyF.length} only in forecasts`);
}

// ── 5. spots-index.json + spots-lite.json ──
const spotsIndex = read('spots-index.json');
check('spots-index', spotsIndex !== undefined, 'file missing');
if (spotsIndex !== undefined) {
  check('spots-index.generatedAt', isIso(spotsIndex.generatedAt), 'missing/invalid generatedAt');
  check('spots-index.spots', Array.isArray(spotsIndex.spots) && spotsIndex.spots.length > 0,
    'missing/empty spots array');
}
const spotsLite = read('spots-lite.json');
check('spots-lite', spotsLite !== undefined, 'file missing');
if (spotsLite !== undefined) {
  check('spots-lite.shape', Array.isArray(spotsLite) && spotsLite.length > 0, 'must be a non-empty array');
  const bad = spotsLite.filter((s) => !s || typeof s.slug !== 'string' || typeof s.name !== 'string');
  check('spots-lite.entries', bad.length === 0, `${bad.length} entr(ies) missing slug/name`);
}

// ── 6. ih-tides.json + ipma-station-map.json ──
const tides = read('ih-tides.json');
check('ih-tides', tides !== undefined, 'file missing');
if (tides !== undefined) {
  check('ih-tides.fetchedAt', isIso(tides.fetchedAt), 'missing/invalid fetchedAt');
  check('ih-tides.spotMapping', typeof tides.spotMapping === 'object' && tides.spotMapping !== null
    && Object.keys(tides.spotMapping).length > 0, 'missing/empty spotMapping');
}
const stationMap = read('ipma-station-map.json');
if (stationMap !== undefined) {
  check('ipma-station-map.shape', typeof stationMap === 'object' && stationMap !== null
    && Object.keys(stationMap).length > 0, 'must be a non-empty object');
}
// ih-buoys.json é opcional (warn se ausente): uma outage/first-run das boias
// IH nunca pode bloquear o deploy — o merge-observations salta observedWave.
const buoys = read('ih-buoys.json');
if (buoys !== undefined) {
  check('ih-buoys.fetchedAt', isIso(buoys.fetchedAt), 'missing/invalid fetchedAt');
  check('ih-buoys.stations', typeof buoys.stations === 'object' && buoys.stations !== null
    && Object.keys(buoys.stations).length > 0, 'missing/empty stations');
  check('ih-buoys.spotMapping', typeof buoys.spotMapping === 'object' && buoys.spotMapping !== null,
    'missing spotMapping');
} else {
  warn('ih-buoys.json missing — IH buoy outage or first run; observedWave skipped');
}
// wmo-buoys.json é opcional (warn se ausente): fallback Copernicus (keyless),
// nunca bloqueia o deploy — o observedWave usa IH primário e este como fallback.
const wmoBuoys = read('wmo-buoys.json');
if (wmoBuoys !== undefined) {
  check('wmo-buoys.fetchedAt', isIso(wmoBuoys.fetchedAt), 'missing/invalid fetchedAt');
  check('wmo-buoys.buoys', typeof wmoBuoys.buoys === 'object' && wmoBuoys.buoys !== null,
    'missing buoys');
  check('wmo-buoys.spotMapping', typeof wmoBuoys.spotMapping === 'object' && wmoBuoys.spotMapping !== null,
    'missing spotMapping');
} else {
  warn('wmo-buoys.json missing — Copernicus fallback outage or first run; IH-only observedWave');
}
// wave-bias.json é opcional (warn se ausente): o viés nunca bloqueia o deploy e
// só é consumido pelo update-conditions com VENTU_WAVE_BIAS_CORRECTION=1.
const waveBias = read('wave-bias.json');
if (waveBias !== undefined) {
  check('wave-bias.fetchedAt', isIso(waveBias.fetchedAt), 'missing/invalid fetchedAt');
  check('wave-bias.buoys', typeof waveBias.buoys === 'object' && waveBias.buoys !== null,
    'missing buoys');
  check('wave-bias.regions', typeof waveBias.regions === 'object' && waveBias.regions !== null,
    'missing regions');
  if (
    waveBias.coherenceGate &&
    Array.isArray(waveBias.coherenceGate.gatedCodes) &&
    waveBias.coherenceGate.gatedCodes.length > 0
  ) {
    warn(`wave-bias: boias ES ${waveBias.coherenceGate.gatedCodes.join(', ')} incoherentes vs PT` +
      ` (${waveBias.coherenceGate.day ?? '?'}) — bias não atribuído a regiões`);
  }
} else {
  warn('wave-bias.json missing — sem viés calculado; correcção regional desligada');
}
// wmo-bias-archive.json é opcional (warn se ausente): o arquivo de leituras
// das boias ES (Copernicus WMO, sem key) acumula até N≥30 para o viés ES.
const wmoBiasArchive = read('wmo-bias-archive.json');
if (wmoBiasArchive !== undefined) {
  check('wmo-bias-archive.fetchedAt', isIso(wmoBiasArchive.fetchedAt), 'missing/invalid fetchedAt');
  check('wmo-bias-archive.buoys',
    typeof wmoBiasArchive.buoys === 'object' && wmoBiasArchive.buoys !== null,
    'missing buoys');
  // Cobertura ES desperdiçada: boia com leituras acumuladas mas sem nenhum spot
  // mapeado (ex. Villano/Bilbao/Peñas — longe do catálogo PT). Os dados
  // acumulam run a run no wmo-bias-archive mas nunca chegam ao observedWave —
  // aviso (não bloqueia): adicionar mapping ou podar a boia.
  const wasted = findUnmappedEsBuoys(wmoBiasArchive, wmoBuoys);
  if (wasted.length > 0) {
    warn(`wmo-bias-archive: ${wasted.length} boia(s) ES com leituras acumuladas sem spot mapeado — cobertura geográfica desperdiçada: ` +
      wasted.map((w) => `${w.name ? `${w.name} (${w.code}, ${w.readings})` : `${w.code} (${w.readings})`}`).join(', '));
  }
} else {
  warn('wmo-bias-archive.json missing — viés ES (Galiza/Cantábrico) não acumulado');
}

// buoy-coherence-archive.json é opcional (warn se ausente): os pares ES×PT
// acumulam dia a dia (padrão forecast-skill) para n suficiente com boias PT
// esparsas — os veredictos do relatório vêm desta acumulação.
const buoyCoherenceArchive = read('buoy-coherence-archive.json');
if (buoyCoherenceArchive !== undefined) {
  check('buoy-coherence-archive.fetchedAt', isIso(buoyCoherenceArchive.fetchedAt),
    'missing/invalid fetchedAt');
  check('buoy-coherence-archive.pairs', Array.isArray(buoyCoherenceArchive.pairs),
    'missing pairs array');
} else {
  warn('buoy-coherence-archive.json missing — coerência acumulada não disponível');
}

// buoy-coherence-daily.json é opcional (warn se ausente): o histórico de
// veredictos por dia/par detecta PADRÕES SAZONAIS (não só o dia actual).
const buoyCoherenceDaily = read('buoy-coherence-daily.json');
if (buoyCoherenceDaily !== undefined) {
  check('buoy-coherence-daily.fetchedAt', isIso(buoyCoherenceDaily.fetchedAt),
    'missing/invalid fetchedAt');
  check('buoy-coherence-daily.days', Array.isArray(buoyCoherenceDaily.days),
    'missing days array');
} else {
  warn('buoy-coherence-daily.json missing — histórico diário de veredictos indisponível');
}

// buoy-coherence.json é opcional (warn se ausente): a validação cross-border
// nunca bloqueia o deploy; um veredicto incoherent é aviso para revisão humana.
const buoyCoherence = read('buoy-coherence.json');
if (buoyCoherence !== undefined) {
  check('buoy-coherence.fetchedAt', isIso(buoyCoherence.fetchedAt), 'missing/invalid fetchedAt');
  check('buoy-coherence.pairs', Array.isArray(buoyCoherence.pairs), 'missing pairs array');
  check('buoy-coherence.overall',
    ['coherent', 'review', 'incoherent', 'insufficient'].includes(buoyCoherence.overall),
    'invalid overall verdict');
  // Registra o floor real do veredicto (janela acumulada) — quem lê o relatório
  // deve saber a quantas horas o veredicto foi calculado.
  if (Number.isInteger(buoyCoherence.minAccumulatedPairs)) {
    check('buoy-coherence.minAccumulatedPairs',
      Number.isInteger(buoyCoherence.minAccumulatedPairs) && buoyCoherence.minAccumulatedPairs > 0,
      'invalid minAccumulatedPairs');
  }
  for (const pair of buoyCoherence.pairs ?? []) {
    // Intervalo de tempo coberto pelo veredicto (firstHour → lastHour da janela):
    // sem ele, "incoherent" não diz QUANDO os buoys divergiram.
    const span =
      pair.firstHour && pair.lastHour
        ? ` · ${pair.firstHour}→${pair.lastHour}`
        : '';
    if (pair.verdict === 'incoherent') {
      warn(`buoy-coherence: par ${pair.pair} incoherent (n=${pair.n}, mean|Δ| ${pair.meanAbsDeltaM} m${span}; floor n≥${buoyCoherence.minAccumulatedPairs ?? '?'}) — revisar observedWave cross-border`);
    } else if (pair.verdict === 'insufficient') {
      warn(`buoy-coherence: par ${pair.pair} com amostra insuficiente (n=${pair.n}<${buoyCoherence.minAccumulatedPairs ?? '?'}${span}) — sem veredicto fiável hoje`);
    }
  }
  // Auditoria por região (escrita pelo merge-observations): a fonte anexada
  // ao observedWave deve ser a boia mais próxima do spot.
  if (buoyCoherence.regions && typeof buoyCoherence.regions === 'object') {
    const anomalies = Object.entries(buoyCoherence.regions).filter(
      ([, r]) => r.attachedNotClosest > 0,
    );
    for (const [region, r] of anomalies) {
      const ex = (r.notClosest ?? [])[0];
      const detail = ex
        ? `ex. ${ex.spot}: ${ex.winner} a ${ex.attachedKm} km vs alternativa a ${ex.altKm} km`
        : '';
      warn(`buoy-coherence.regions.${region}: ${r.attachedNotClosest} spot(s) com fonte não-closest ${detail ? `(${detail})` : ''}`);
    }
    // Referência PT usada na calibração cross-border: quando uma região tem
    // spots calibrados, o par ES→PT escolhido tem de estar registado (com
    // ptRefCode e ME/n) — senão a calibração aconteceu sem auditoria.
    for (const [region, r] of Object.entries(buoyCoherence.regions)) {
      if ((r.calibrated ?? 0) <= 0) continue;
      const refs = r.calibrationRefs ?? {};
      const keys = Object.keys(refs);
      if (keys.length === 0) {
        warn(`buoy-coherence.regions.${region}: ${r.calibrated} spot(s) calibrados mas sem calibrationRefs registadas`);
        continue;
      }
      for (const key of keys) {
        const ref = refs[key];
        if (!ref?.ptRefCode || !Number.isFinite(ref.me) || !Number.isFinite(ref.n)) {
          warn(`buoy-coherence.regions.${region}: par ${key} sem ptRefCode/ME/n válidos`);
        }
      }
    }
  }
  // Histórico do gate cross-border (acumulado pelo merge-observations): quantas
  // vezes cada boia ES foi recusada e porquê. Preservado pelo check quando
  // re-escreve o ficheiro; valida a shape para o About/auditoria lerem.
  if (buoyCoherence.gateHistory && typeof buoyCoherence.gateHistory === 'object') {
    check('buoy-coherence.gateHistory.windowDays',
      Number.isInteger(buoyCoherence.gateHistory.windowDays),
      'invalid gateHistory.windowDays');
    if (buoyCoherence.gateHistory.lastUpdated != null) {
      check('buoy-coherence.gateHistory.lastUpdated', isIso(buoyCoherence.gateHistory.lastUpdated),
        'invalid gateHistory.lastUpdated');
    }
    const byCode = buoyCoherence.gateHistory.byCode;
    if (byCode && typeof byCode === 'object') {
      for (const code of Object.keys(byCode)) {
        const r = byCode[code];
        if (!r || !Array.isArray(r.events)) {
          warn(`buoy-coherence.gateHistory.${code}: sem array de events`);
          continue;
        }
        if (r.dayCount > 1) {
          const last = r.events[r.events.length - 1];
          warn(`buoy-coherence.gateHistory.${code}: recusada ${r.dayCount} dias (${r.totalSpots} spots) — último ${last?.day ?? '?'} (gate recorrente)`);
        }
      }
    }
  }
} else {
  warn('buoy-coherence.json missing — coerência cross-border não validada');
}

// wind-bias.json é opcional (warn se ausente): o viés de vento por estação
// acumula run a run (merge-observations) e nunca bloqueia o deploy; sem
// observações frescas o arquivo simplesmente não é escrito.
const windBiasData = read('wind-bias.json');
if (windBiasData !== undefined) {
  check('wind-bias.pairs', Array.isArray(windBiasData.pairs), 'missing pairs array');
  check('wind-bias.stations', typeof windBiasData.stations === 'object' && windBiasData.stations !== null,
    'missing stations object');
  if (windBiasData.fetchedAt !== null && windBiasData.fetchedAt !== undefined) {
    check('wind-bias.fetchedAt', isIso(windBiasData.fetchedAt), 'missing/invalid fetchedAt');
  }
} else {
  warn('wind-bias.json missing — viés de vento por estação não acumulado (sem observações frescas ainda)');
}

// forecast-skill.json é opcional (warn se ausente): o skill real acumula run a
// run e nunca bloqueia o deploy; sem pares ainda o stats fica null (normal).
const forecastSkill = read('forecast-skill.json');
if (forecastSkill !== undefined) {
  check('forecast-skill.fetchedAt', isIso(forecastSkill.fetchedAt), 'missing/invalid fetchedAt');
  check('forecast-skill.forecasts', Array.isArray(forecastSkill.forecasts), 'missing forecasts array');
  check('forecast-skill.observations', Array.isArray(forecastSkill.observations),
    'missing observations array');
  check('forecast-skill.pairCount', Number.isInteger(forecastSkill.pairCount),
    'missing pairCount');
  // byBuoy pode conter idEst numéricos (IH) e códigos WMO string (boias ES).
  check('forecast-skill.byBuoy', typeof forecastSkill.byBuoy === 'object' && forecastSkill.byBuoy !== null,
    'missing byBuoy object');
} else {
  warn('forecast-skill.json missing — skill real não acumulado (configurar IH_API_KEY ou aguardar boias ES)');
}

// skill-regression.json é opcional (warn se ausente): o health-check do
// forecast-skill compara a janela recente vs baseline por boia e nunca
// bloqueia o deploy — uma regressão é aviso para revisão humana.
const skillRegression = read('skill-regression.json');
if (skillRegression !== undefined) {
  check('skill-regression.checkedAt', isIso(skillRegression.checkedAt),
    'missing/invalid checkedAt');
  check('skill-regression.byBuoy', typeof skillRegression.byBuoy === 'object'
    && skillRegression.byBuoy !== null, 'missing byBuoy object');
  check('skill-regression.regressions', Array.isArray(skillRegression.regressions),
    'missing regressions array');
  if (Array.isArray(skillRegression.regressions) && skillRegression.regressions.length > 0) {
    warn(`skill-regression: ${skillRegression.regressions.length} boia(s) com regressão do forecast ` +
      `(${skillRegression.regressions.map((r) => `${r.name} ${r.reasons?.join('; ') ?? ''}`).join(' | ')})`);
  }
} else {
  warn('skill-regression.json missing — regressão do forecast-skill não auditada (passo full opcional)');
}

// warnings.json é opcional (warn se ausente): avisos IPMA nunca bloqueiam o deploy.
// (nome da variável ≠ collector `warnings` — ver topo do ficheiro)
const ipmaWarningsData = read('warnings.json');
if (ipmaWarningsData !== undefined) {
  check('warnings.fetchedAt', isIso(ipmaWarningsData.fetchedAt), 'missing/invalid fetchedAt');
  check('warnings.warnings', Array.isArray(ipmaWarningsData.warnings), 'missing warnings array');
  check('warnings.spotWarnings', typeof ipmaWarningsData.spotWarnings === 'object' && ipmaWarningsData.spotWarnings !== null,
    'missing spotWarnings');
  if (ipmaWarningsData.source !== undefined) {
    check('warnings.source', ['ipma', 'meteoalarm'].includes(ipmaWarningsData.source),
      `unexpected source ${JSON.stringify(ipmaWarningsData.source)}`);
  }
} else {
  warn('warnings.json missing — IPMA/MeteoAlarm outage or first run; warnings UI skipped');
}

// radar.json + frame PNG são opcionais (warn if ausente): o radar do IPMA nunca
// bloqueia o deploy — a camada fica simplesmente desligada no mapa.
const radarData = read('radar.json');
if (radarData !== undefined) {
  check('radar.source', radarData.source === 'ipma-radar', 'unexpected source');
  check('radar.frameTime', isIso(radarData.frameTime), 'missing/invalid frameTime');
  check('radar.bounds',
    radarData.bounds &&
      ['south', 'west', 'north', 'east'].every((k) => Number.isFinite(radarData.bounds[k])),
    'missing/invalid bounds');
  check('radar.image',
    typeof radarData.imagePath === 'string' &&
      fs.existsSync(path.join(DATA, radarData.imagePath)),
    `missing frame file ${radarData.imagePath}`);
} else {
  warn('radar.json missing — IPMA radar layer off (first run or outage)');
}

// model-health.json existe só nos runs multi-modelo (dia). Quando presente,
// valida a shape; ausente em runs nocturnos é esperado — nunca bloqueia.
const modelHealthData = read('model-health.json');
if (modelHealthData !== undefined) {
  check('model-health.checkedAt', isIso(modelHealthData.checkedAt), 'missing/invalid checkedAt');
  check('model-health.dead', Array.isArray(modelHealthData.dead), 'missing dead array');
  if (Array.isArray(modelHealthData.dead) && modelHealthData.dead.length > 0) {
    warn(`model-health: ${modelHealthData.dead.length} modelo(s) morto(s) — ${modelHealthData.dead.map((d) => `${d.family}/${d.model}`).join(', ')}`);
  }
}

// ── 7. dawn-patrol.json (separate workflow, validate if present) ──
const dawn = read('dawn-patrol.json');
if (dawn !== undefined) {
  check('dawn-patrol.generatedAt', isIso(dawn.generatedAt), 'missing/invalid generatedAt');
  check('dawn-patrol.spots', Array.isArray(dawn.spots), 'missing spots array');
}

// ── 8. TTL — freshness of what THIS run must have refreshed ──
// Both full and observations runs refresh: IH tides, spots index, observations.
// IH tides: warn-only if stale. fetch-ih-tides.js keeps the previous file and
// exits 0 so a multi-day IH outage (e.g. 2026-07-29, fetchedAt 14+ days old)
// must NOT brick Open-Meteo / obs. Schema checks above stay hard-fail.
const TTL_TIDES_H = 24;
const TTL_SPOTS_INDEX_H = 2.5;
const TTL_OBS_H = 2;
if (tides !== undefined && isIso(tides.fetchedAt)) {
  const age = ageHours(tides.fetchedAt);
  checks.push('ttl.ih-tides');
  if (age > TTL_TIDES_H) {
    warn(`ttl.ih-tides: fetchedAt ${age.toFixed(1)}h old (>${TTL_TIDES_H}h) — IH outage; schema OK, pipeline continues`);
  }
}
if (buoys !== undefined && isIso(buoys.fetchedAt)) {
  const age = ageHours(buoys.fetchedAt);
  checks.push('ttl.ih-buoys');
  if (age > TTL_TIDES_H) {
    warn(`ttl.ih-buoys: fetchedAt ${age.toFixed(1)}h old (>${TTL_TIDES_H}h) — IH outage; schema OK, pipeline continues`);
  }
}
if (wmoBuoys !== undefined && isIso(wmoBuoys.fetchedAt)) {
  const age = ageHours(wmoBuoys.fetchedAt);
  checks.push('ttl.wmo-buoys');
  if (age > TTL_TIDES_H) {
    warn(`ttl.wmo-buoys: fetchedAt ${age.toFixed(1)}h old (>${TTL_TIDES_H}h) — Copernicus outage; schema OK, pipeline continues`);
  }
}
if (spotsIndex !== undefined && isIso(spotsIndex.generatedAt)) {
  check('ttl.spots-index', ageHours(spotsIndex.generatedAt) <= TTL_SPOTS_INDEX_H,
    `generatedAt ${ageHours(spotsIndex.generatedAt).toFixed(1)}h old (>${TTL_SPOTS_INDEX_H}h)`);
}
if (meta !== undefined && isIso(meta.observationsUpdatedAt)) {
  check('ttl.observations', ageHours(meta.observationsUpdatedAt) <= TTL_OBS_H,
    `observationsUpdatedAt ${ageHours(meta.observationsUpdatedAt).toFixed(1)}h old (>${TTL_OBS_H}h)`);
}
// Full runs only: the Open-Meteo backstop (same constants as the scheduler).
if (MODE === 'full' && meta !== undefined && isIso(meta.fullUpdatedAt)) {
  const { hour } = getLisbonParts();
  const isDaytime = hour >= 6 && hour <= 20;
  const max = isDaytime ? STALE_FULL_HOURS_DAY : STALE_FULL_HOURS_NIGHT;
  check('ttl.fullUpdatedAt', ageHours(meta.fullUpdatedAt) <= max,
    `fullUpdatedAt ${ageHours(meta.fullUpdatedAt).toFixed(1)}h old (>${max}h in ${isDaytime ? 'day' : 'night'})`);
}

// ── Report ──
if (warnings.length > 0) {
  console.warn(`⚠️ validate-generated-data (mode=${MODE}): ${warnings.length} warning(s)\n`);
  for (const w of warnings) console.warn(`  - ${w}`);
}
if (errors.length > 0) {
  console.error(`❌ validate-generated-data (mode=${MODE}): ${errors.length} problem(s)\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✅ validate-generated-data (mode=${MODE}): ${checks.length} checks OK — schema + TTL valid`);
