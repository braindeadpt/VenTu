/**
 * Merge IPMA + Ecowitt + METAR into conditions.json (observed layer; scores use it when fresh).
 * Rule: within ~8 km prefer Ecowitt > IPMA > METAR; else nearest ≤30 km and ≤3 h; tie → freshest.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  buildObservedPayload,
  fetchIpmaObservations,
  findLatestObservationForStation,
  parseSpotsFromFile,
  MAX_STATION_DISTANCE_KM,
} = require('./lib/ipma.js');
const { fetchEcowittSnapshot, buildEcowittObservedForSpot, getEcowittCredentials } = require('./lib/ecowitt.js');
const { fetchMetarByIcao, buildMetarObservedForSpot } = require('./lib/metar.js');
const { pickBestObservation } = require('./lib/observationPick.js');
const { observedWaveForSpot } = require('./lib/ihBuoys.js');
const {
  haversineKm,
  observedWaveForSpot: wmoObservedWaveForSpot,
  ES_BUOY_CODES,
} = require('./lib/copernicusBuoys.js');
const {
  incoherentEsCodes,
  isEsCodeGated,
  crossBorderCalibration,
  applyCrossBorderCalibration,
  buildRegionSourceAudit,
  mergeGateRun,
  gateRefusalReason,
} = require('./lib/buoyCoherence.js');
const { consecutiveIncoherentDays } = require('./lib/buoyCoherenceDaily.js');
const { writePipelineMeta } = require('./lib/pipelineMeta.js');
const { loadBuoyLayerStatus } = require('./lib/buoyLayerHealth.js');
const { attachWaveSkill } = require('./lib/forecastSkill.js');
const {
  stationKey,
  hourKeyOf,
  readArchive: readWindBiasArchive,
  writeArchive: writeWindBiasArchive,
  mergePairs: mergeWindPairs,
  pruneArchive: pruneWindArchive,
  buildReport: buildWindReport,
  MS_TO_KNOTS,
} = require('./lib/windBiasArchive.js');
const { selectObservedWave } = require('./lib/observedWaveMerge.js');
const { parseSpotsWithRegions } = require('./lib/buoyBias.js');

// Vários dias consecutivos de incoerência ES×PT → a leitura nacional (IH) que
// serve a região também perde confiança (campo de onda lido de forma divergente
// por fontes independentes), não só a rota espanhola — ver aviso na UI.
const MIN_CONSECUTIVE_INCOHERENT_DAYS = 3;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
// Paths env-overridable (testes hermeticos + smoke) — mesmo padrão do fetch-wave-bias.
const mapPath =
  process.env.IPMA_STATION_MAP_PATH || path.join(root, 'public/data/ipma-station-map.json');
const conditionsPath =
  process.env.CONDITIONS_PATH || path.join(root, 'public/data/conditions.json');
const spotsPath = process.env.SPOTS_PATH || path.join(root, 'src/lib/spots.ts');
const ihBuoysPath =
  process.env.IH_BUOYS_PATH || path.join(root, 'public/data/ih-buoys.json');
const wmoPath = process.env.WMO_BUOYS_PATH || path.join(root, 'public/data/wmo-buoys.json');
const skillPath =
  process.env.FORECAST_SKILL_PATH || path.join(root, 'public/data/forecast-skill.json');
const coherencePath =
  process.env.BUOY_COHERENCE_PATH || path.join(root, 'public/data/buoy-coherence.json');
const dailyCoherencePath =
  process.env.BUOY_COHERENCE_DAILY_PATH ||
  path.join(root, 'public/data/buoy-coherence-daily.json');
const windBiasPath =
  process.env.WIND_BIAS_PATH || path.join(root, 'public/data/wind-bias.json');

/**
 * PT reference buoy for the cross-border calibration: the mainland PT
 * Datawell code (6201077 Porto / 6201079 Faro) closest to the spot — the
 * pair whose systematic ME calibrates the ES reading to the local wave field.
 * @param {{ buoys?: Record<string, { country?: string, lat?: number, lon?: number }> } | null} wmoBuoys
 * @param {{ lat: number, lon: number }} spot
 * @returns {string | null} WMO platform code
 */
function nearestPtRefCode(wmoBuoys, spot) {
  const buoys = wmoBuoys?.buoys ?? {};
  let best = null;
  let bestKm = Infinity;
  for (const code of Object.keys(buoys)) {
    const b = buoys[code];
    if (b?.country !== 'PT') continue;
    if (!Number.isFinite(b.lat) || !Number.isFinite(b.lon)) continue;
    const km = haversineKm(spot.lat, spot.lon, b.lat, b.lon);
    if (km < bestKm) {
      bestKm = km;
      best = code;
    }
  }
  return best;
}

/**
 * Closest ES (Puertos del Estado / Copernicus) buoy to the spot — the ES leg of
 * the ES×PT pair whose persistent incoherence lowers confidence in the IH
 * reading. Falls back to the spot's own mapped ES code when that is closer.
 * @param {{ buoys?: Record<string, { country?: string, lat?: number, lon?: number }> } | null} wmoBuoys
 * @param {{ lat: number, lon: number }} spot
 * @param {string | null} mappedEsCode the spot's mapped WMO code if it is ES
 * @returns {string | null} WMO ES platform code
 */
function closestEsCode(wmoBuoys, spot, mappedEsCode) {
  const buoys = wmoBuoys?.buoys ?? {};
  let best = null;
  let bestKm = Infinity;
  if (mappedEsCode && buoys[mappedEsCode]) {
    const m = buoys[mappedEsCode];
    const mKm = haversineKm(spot.lat, spot.lon, m.lat, m.lon);
    best = mappedEsCode;
    bestKm = mKm;
  }
  for (const code of Object.keys(buoys)) {
    const b = buoys[code];
    if (b?.country !== 'ES') continue;
    if (!Number.isFinite(b.lat) || !Number.isFinite(b.lon)) continue;
    const km = haversineKm(spot.lat, spot.lon, b.lat, b.lon);
    if (km < bestKm) {
      bestKm = km;
      best = code;
    }
  }
  return best;
}

export async function mergeObservations() {
  console.log('🌡️ Observations — IPMA + Ecowitt + METAR → conditions.json...');

  if (!fs.existsSync(conditionsPath)) {
    console.error('❌ conditions.json missing — run npm run conditions:update first');
    process.exit(1);
  }

  if (!fs.existsSync(mapPath)) {
    console.error('❌ ipma-station-map.json missing — run npm run obs:map first');
    process.exit(1);
  }

  const stationMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
  const conditions = JSON.parse(fs.readFileSync(conditionsPath, 'utf-8'));
  const spots = parseSpotsFromFile(spotsPath);
  const slugById = Object.fromEntries(spots.map((s) => [s.id, s.slug]));
  const aliasSpots = spots.filter((s) => s.conditionsSource);

  let ihBuoys = null;
  try {
    if (fs.existsSync(ihBuoysPath)) {
      ihBuoys = JSON.parse(fs.readFileSync(ihBuoysPath, 'utf-8'));
      const st = Object.keys(ihBuoys.stations ?? {}).length;
      const mp = Object.keys(ihBuoys.spotMapping ?? {}).length;
      console.log(
        `   IH buoys: ${st} stations, ${mp} spot mappings${ihBuoys.hasWaveData ? '' : ' (no wave data)'}`,
      );
    } else {
      console.log('   IH buoys: skipped (ih-buoys.json missing)');
    }
  } catch (err) {
    console.warn(`⚠️ ih-buoys.json parse failed: ${err.message}`);
  }

  // Real forecast skill per buoy (forecast-skill.json byBuoy, ME/n) — attached
  // to the observedWave rows so the UI can label the correction transparently.
  let forecastSkill = null;
  try {
    if (fs.existsSync(skillPath)) {
      forecastSkill = JSON.parse(fs.readFileSync(skillPath, 'utf-8'));
    }
  } catch (err) {
    console.warn(`⚠️ forecast-skill.json parse failed: ${err.message}`);
  }

  // WMO fallback layer (Copernicus S3, keyless) — same Portuguese Datawell
  // buoys ingested independently; covers spots when the IH layer is stale,
  // down, or the IH_API_KEY is missing. Spanish codes auto-enter when live.
  //
  // Gate cross-border (buoy-coherence.json, passo anterior no workflow): se o
  // par ES×PT do dia estiver incoherent, recusa-se anexar essa boia espanhola
  // aos spots PT (o observedWave cai para IH-only ou fica sem leitura) — a
  // leitura pode estar a descrever outra onda.
  let gatedWmoCodes = new Set();
  let coherenceReport = null;
  try {
    if (fs.existsSync(coherencePath)) {
      coherenceReport = JSON.parse(fs.readFileSync(coherencePath, 'utf-8'));
      gatedWmoCodes = new Set(incoherentEsCodes(coherenceReport, ES_BUOY_CODES));
      if (gatedWmoCodes.size > 0) {
        console.warn(
          `🔴 WMO recusada por coerência (par ES×PT incoherent): ${[...gatedWmoCodes].join(', ')} — boias espanholas não anexadas a spots PT este run.`,
        );
      }
    }
  } catch (err) {
    console.warn(`⚠️ buoy-coherence.json parse failed: ${err.message}`);
  }

  // Arquivo diário de veredictos (buoy-coherence-daily.json) — persistido para
  // detectar divergências sazonais recorrentes. Quando um par ES×PT persiste
  // incoherent por VÁRIOS dias consecutivos, a leitura nacional (IH) que serve
  // a região também fica sob suspeita: o campo de onda está a ser lido de forma
  // diferente por fontes independentes, não só a rota espanhola de hoje. O merge
  // anexa um aviso de confiança baixa ao observedWave IH — não se limita a
  // bloquear a rota ES (que o gate do report diário já faz).
  let dailyCoherence = null;
  try {
    if (fs.existsSync(dailyCoherencePath)) {
      dailyCoherence = JSON.parse(fs.readFileSync(dailyCoherencePath, 'utf-8'));
    }
  } catch (err) {
    console.warn(`⚠️ buoy-coherence-daily.json parse failed: ${err.message}`);
  }

  // Viés de vento por estação (IPMA/Ecowitt/METAR): o merge acumula pares
  // previsão(kt) × observado(kt) run a run, deduplicados por estação+spot+hora,
  // e anexa o ME/n da estação à row (badge «Vento observado» com tooltip do viés).
  let windArchive = readWindBiasArchive(windBiasPath);
  const windPairs = [];

  let wmoBuoys = null;
  try {
    if (fs.existsSync(wmoPath)) {
      wmoBuoys = JSON.parse(fs.readFileSync(wmoPath, 'utf-8'));
      const nb = Object.keys(wmoBuoys.buoys ?? {}).length;
      const mp = Object.keys(wmoBuoys.spotMapping ?? {}).length;
      console.log(
        `   WMO buoys: ${nb} stations, ${mp} spot mappings${wmoBuoys.hasWaveData ? '' : ' (no wave data)'}`,
      );
    } else {
      console.log('   WMO buoys: skipped (wmo-buoys.json missing)');
    }
  } catch (err) {
    console.warn(`⚠️ wmo-buoys.json parse failed: ${err.message}`);
  }

  let ipmaSnapshots = null;
  try {
    ipmaSnapshots = await fetchIpmaObservations();
    console.log(`   IPMA: ${Object.keys(ipmaSnapshots).length} hourly snapshots`);
  } catch (err) {
    console.warn(`⚠️ IPMA fetch failed: ${err.message}`);
  }

  let ecowittSnapshot = null;
  if (getEcowittCredentials()) {
    try {
      ecowittSnapshot = await fetchEcowittSnapshot();
      console.log(
        `   Ecowitt: ${ecowittSnapshot.stationName} @ ${ecowittSnapshot.lat.toFixed(5)}, ${ecowittSnapshot.lon.toFixed(5)}`,
      );
    } catch (err) {
      console.warn(`⚠️ Ecowitt fetch failed: ${err.message}`);
    }
  } else {
    console.log('   Ecowitt: skipped (ECOWITT_* env not set)');
  }

  let metarByIcao = null;
  try {
    metarByIcao = await fetchMetarByIcao();
    console.log(`   METAR: ${Object.keys(metarByIcao).length} airports with reports`);
  } catch (err) {
    console.warn(`⚠️ METAR fetch failed: ${err.message}`);
  }

  let withObserved = 0;
  let withWave = 0;
  let withBothSources = 0;
  let wmoFallback = 0;
  let refusedWmo = 0;
  // Recusas por boia ES (histórico do gate) — contagem de spots descartados por
  // código ES neste run, para acumular no report.gateHistory do buoy-coherence.
  const refusedByCode = new Map();
  let calibratedCrossBorder = 0;
  // Referência PT usada na calibração cross-border, por spot calibrado: o par
  // ES×PT escolhido (a boia PT mais próxima do spot) é o que recalibra a
  // leitura espanhola — exposto no bloco `regions` do buoy-coherence.json
  // para auditar que a calibração escolheu o par certo (e não outro).
  const calibrationRefsBySpot = new Map();
  let ecowittWins = 0;
  let ipmaWins = 0;
  let metarWins = 0;

  for (const spot of spots) {
    if (spot.conditionsSource) continue;
    if (!conditions[spot.id]) continue;

    const mapping = stationMap[spot.slug];
    let ipmaCandidate = null;
    if (mapping && ipmaSnapshots) {
      const stationTries = [
        { idEstacao: mapping.idEstacao, stationName: mapping.stationName, distanceKm: mapping.distanceKm },
        ...(Array.isArray(mapping.alternates) ? mapping.alternates : []),
      ];
      for (const trySt of stationTries) {
        if (trySt.distanceKm > MAX_STATION_DISTANCE_KM) continue;
        const obs = findLatestObservationForStation(ipmaSnapshots, trySt.idEstacao);
        if (obs) {
          ipmaCandidate = buildObservedPayload(obs, trySt.stationName, trySt.distanceKm);
          break;
        }
      }
    }

    let ecowittCandidate = null;
    if (ecowittSnapshot) {
      ecowittCandidate = buildEcowittObservedForSpot(spot, ecowittSnapshot);
    }

    const metarCandidate = buildMetarObservedForSpot(spot, metarByIcao);

    const picked = pickBestObservation(ipmaCandidate, ecowittCandidate, metarCandidate);
    if (picked) {
      conditions[spot.id].observed = picked;
      withObserved++;
      if (picked.source === 'ecowitt') ecowittWins++;
      else if (picked.source === 'metar') metarWins++;
      else ipmaWins++;

      // Par de viés de vento (só quando a leitura está fresca — é o que o score
      // usa): previsão da row (m/s → kt) × observado da estação. Acumula no
      // wind-bias.json para ME/MAE/RMSE/n por estação (tooltip do badge).
      const forecastMs = Number(conditions[spot.id].windSpeed);
      if (Number.isFinite(forecastMs) && forecastMs > 0) {
        const ageHours =
          (Date.now() - new Date(picked.observedAt).getTime()) / 3_600_000;
        if (Number.isFinite(ageHours) && ageHours >= 0 && ageHours <= 3) {
          windPairs.push({
            stationKey: stationKey(picked.source, picked.stationName, picked.metarIcao),
            spotId: spot.id,
            hourKey: hourKeyOf(picked.observedAt),
            observedAt: picked.observedAt,
            observedKt: picked.windSpeedKt,
            forecastKt: Math.round(forecastMs * MS_TO_KNOTS),
            source: picked.source,
            stationName: picked.stationName,
          });
        }
      }
    } else {
      delete conditions[spot.id].observed;
    }

    // Measured wave — deep-water reference, separate from wind.
    // IH Datawell buoy first (keyed API); WMO/Copernicus buoy as fallback
    // (keyless, independent route — same PT buoys via GTS, ES buoys later).
    // Both candidates are computed so the UI can show them side by side with
    // the winner + reason (freshness/distance) when both have readings.
    const buoyMapping = ihBuoys?.spotMapping?.[spot.id];
    const buoyStation =
      buoyMapping && ihBuoys?.stations?.[String(buoyMapping.idEst)];
    const ihWave = observedWaveForSpot(buoyMapping, buoyStation);
    const wmoMapping = wmoBuoys?.spotMapping?.[spot.id];
    const wmoCode = wmoMapping?.code != null ? String(wmoMapping.code) : null;
    const wmoGated = isEsCodeGated(coherenceReport, ES_BUOY_CODES, wmoCode);
    const wmoBuoy =
      wmoMapping && wmoBuoys?.buoys?.[String(wmoMapping.code)];
    const wmoWave =
      wmoBuoys && !wmoGated ? wmoObservedWaveForSpot(wmoMapping, wmoBuoy) : null;
    if (wmoGated) refusedWmo += 1;
    const { wave, alt, meta } = selectObservedWave(ihWave, wmoWave);
    if (wave) {
      // Transparent bias correction: attach the accumulated per-buoy skill
      // (ME/n from forecast-skill.json) to the reading shown in the UI. The
      // index is keyed by IH idEst (numeric) for IH readings and by WMO code
      // (string) for ES/PT readings from the Copernicus fallback.
      const waveWithSkill =
        wave.source === 'ih-buoy'
          ? attachWaveSkill(wave, forecastSkill?.byBuoy, buoyMapping?.idEst)
          : wave.source === 'wmo-buoy'
            ? attachWaveSkill(wave, forecastSkill?.byBuoy, wmoMapping?.code)
            : wave;
      // Calibração cross-border: quando uma boia ES (Puertos del Estado) é
      // anexada a um spot PT, o viés sistemático do par ES×PT (ME do
      // buoy-coherence.json) recalibra a altura para a referência PT — a
      // leitura espanhola é um proxy da onda local, não a medida. A UI mostra
      // a correcção (valor medido + delta) para nunca esconder o ajuste.
      let waveCalibrated = waveWithSkill;
      if (
        waveWithSkill?.source === 'wmo-buoy' &&
        wmoCode &&
        ES_BUOY_CODES.includes(wmoCode)
      ) {
        const ptRef = nearestPtRefCode(wmoBuoys, spot);
        const calibration = ptRef
          ? crossBorderCalibration(coherenceReport, wmoCode, ptRef)
          : null;
        waveCalibrated = applyCrossBorderCalibration(waveWithSkill, calibration);
        if (waveCalibrated !== waveWithSkill) {
          calibratedCrossBorder++;
          calibrationRefsBySpot.set(spot.id, {
            esCode: wmoCode,
            esName: wmoBuoys?.buoys?.[wmoCode]?.name ?? null,
            ptRefCode: ptRef,
            ptRefName: wmoBuoys?.buoys?.[ptRef]?.name ?? null,
            ptRefArea: wmoBuoys?.buoys?.[ptRef]?.area ?? null,
            pair: calibration.pair ?? null,
            me: calibration.me,
            n: calibration.n,
          });
        }
      }
      conditions[spot.id].observedWave = waveCalibrated;
      if (alt) {
        conditions[spot.id].observedWaveAlt = alt;
        withBothSources++;
      } else {
        delete conditions[spot.id].observedWaveAlt;
      }
      conditions[spot.id].observedWaveMeta = meta;
      withWave++;
      if (wave.source === 'wmo-buoy') wmoFallback++;
    } else {
      delete conditions[spot.id].observedWave;
      delete conditions[spot.id].observedWaveAlt;
      delete conditions[spot.id].observedWaveMeta;
    }

    // Recusa por coerência ES×PT (gate cross-border): quando a leitura ES foi
    // descartada hoje, anexa o flag à row INDEPENDENTEMENTE de haver wave — o
    // aviso aparece junto do card (embora o vencedor possa ser IH ou nada).
    // A UI mostra «leitura ES descartada por incoerência» em vez de omitir em
    // silêncio. Aplica-se a spots servidos por uma boia ES mapeada.
    const esWmoRefused = wmoGated && wmoCode != null;
    if (esWmoRefused) {
      conditions[spot.id].observedWaveCoherenceRefused = {
        esCode: wmoCode,
        day: coherenceReport?.day ?? null,
      };
      refusedByCode.set(
        wmoCode,
        (refusedByCode.get(wmoCode) ?? 0) + 1,
      );
    } else {
      delete conditions[spot.id].observedWaveCoherenceRefused;
    }

    // Confiança baixa da leitura nacional (IH): quando o par ES×PT da região do
    // spot persiste incoherent por N+ dias consecutivos (arquivo diário), mesmo
    // a leitura IH que o serve fica sob suspeita — o campo de onda é lido de
    // forma divergente por fontes independentes ao longo do tempo, não só uma
    // anomalia pontual da rota ES hoje. O aviso baixa a confiança no card, sem
    // bloquear a leitura (IH é primária). Só se aplica a spots servidos por IH
    // com uma boia ES da região mapeável para o par.
    let coherenceWarning = null;
    if (buoyMapping && dailyCoherence) {
      const esCode = closestEsCode(wmoBuoys, spot, wmoCode);
      const ptRef = nearestPtRefCode(wmoBuoys, spot);
      if (esCode && ptRef && ES_BUOY_CODES.includes(esCode)) {
        const cid = consecutiveIncoherentDays(dailyCoherence, [esCode, ptRef]);
        if (cid.days >= MIN_CONSECUTIVE_INCOHERENT_DAYS) {
          coherenceWarning = {
            esCode,
            ptRefCode: ptRef,
            days: cid.days,
            firstDay: cid.firstDay,
            lastDay: cid.lastDay,
          };
        }
      }
    }
    if (coherenceWarning) {
      conditions[spot.id].observedWaveCoherenceWarning = coherenceWarning;
    } else {
      delete conditions[spot.id].observedWaveCoherenceWarning;
    }
  }

  for (const spot of aliasSpots) {
    const srcId = spot.conditionsSource;
    const srcSlug = slugById[srcId];
    if (!srcSlug || !stationMap[srcSlug]) continue;
    const srcObserved = conditions[srcId]?.observed;
    if (srcObserved) {
      conditions[spot.id].observed = { ...srcObserved };
    } else {
      delete conditions[spot.id].observed;
    }
    const srcWave = conditions[srcId]?.observedWave;
    if (srcWave) {
      conditions[spot.id].observedWave = { ...srcWave };
    } else {
      delete conditions[spot.id].observedWave;
    }
    const srcAlt = conditions[srcId]?.observedWaveAlt;
    if (srcAlt) {
      conditions[spot.id].observedWaveAlt = { ...srcAlt };
    } else {
      delete conditions[spot.id].observedWaveAlt;
    }
    const srcMeta = conditions[srcId]?.observedWaveMeta;
    if (srcMeta) {
      conditions[spot.id].observedWaveMeta = { ...srcMeta };
    } else {
      delete conditions[spot.id].observedWaveMeta;
    }
    const srcCoherenceRefused = conditions[srcId]?.observedWaveCoherenceRefused;
    if (srcCoherenceRefused) {
      conditions[spot.id].observedWaveCoherenceRefused = { ...srcCoherenceRefused };
    } else {
      delete conditions[spot.id].observedWaveCoherenceRefused;
    }
    const srcCoherenceWarning = conditions[srcId]?.observedWaveCoherenceWarning;
    if (srcCoherenceWarning) {
      conditions[spot.id].observedWaveCoherenceWarning = { ...srcCoherenceWarning };
    } else {
      delete conditions[spot.id].observedWaveCoherenceWarning;
    }
    const srcNotClosest = conditions[srcId]?.observedWaveNotClosest;
    if (srcNotClosest) {
      conditions[spot.id].observedWaveNotClosest = { ...srcNotClosest };
    } else {
      delete conditions[spot.id].observedWaveNotClosest;
    }
  }

  // ── Viés de vento por estação ────────────────────────────────────────────
  // Funde os pares do run no arquivo (dedupe por estação+spot+hora), faz prune
  // e anexa o ME/n da estação à row (badge «Vento observado» com tooltip).
  let windStations = 0;
  if (windPairs.length > 0) {
    mergeWindPairs(windArchive, windPairs);
    pruneWindArchive(windArchive);
    const windReport = buildWindReport(windArchive);
    windArchive.fetchedAt = new Date().toISOString();
    writeWindBiasArchive(windArchive, windBiasPath);
    windStations = Object.keys(windReport.stations).length;
    for (const spot of spots) {
      if (spot.conditionsSource) continue;
      const obs = conditions[spot.id]?.observed;
      if (!obs) continue;
      const key = stationKey(obs.source, obs.stationName, obs.metarIcao);
      const st = windReport.stations[key];
      if (st) {
        conditions[spot.id].windBias = {
          station: st.station,
          source: st.source,
          me: st.me,
          mae: st.mae,
          rmse: st.rmse,
          n: st.n,
        };
      } else {
        delete conditions[spot.id].windBias;
      }
    }
    console.log(
      `🌬️  Wind bias: ${windReport.pairCount} pairs · ${windStations} estações (n≥${windReport.minPairs}) → wind-bias.json`,
    );
  }

  fs.writeFileSync(conditionsPath, JSON.stringify(conditions, null, 2));

  if (calibratedCrossBorder > 0) {
    console.log(
      `🔧 ${calibratedCrossBorder} spots com leitura ES calibrada para a referência PT (viés ES×PT do buoy-coherence.json)`,
    );
  }
  const buoyLayer = loadBuoyLayerStatus(process.env.PIPELINE_META_ROOT || root);
  writePipelineMeta('observations', new Date(), process.env.PIPELINE_META_ROOT || root, { buoyLayer });
  if (buoyLayer) {
    console.log(
      `🌊 Camada de boias: ${buoyLayer.status} (key ${buoyLayer.apiKeyConfigured ? '✓' : '✗'}, ` +
        `wave data ${buoyLayer.hasWaveData ? '✓' : '✗'}${buoyLayer.newestReadingAt ? `, última leitura ${buoyLayer.newestReadingAt}` : ''})`,
    );
  } else {
    console.log('🌊 Camada de boias: sem ih-buoys.json (primeiro run)');
  }

  // ── Auditoria por região: fonte anexada vs boia mais próxima ─────────────
  // Escreve o bloco `regions` no buoy-coherence.json (o relatório ES×PT do
  // check-buoy-coherence fica intacto) — audit do observedWave RECÉM-anexado:
  // vencedor, distância da fonte anexada vs alternativa, e os spots onde a
  // fonte anexada NÃO é a mais próxima (anomalias).
  try {
    if (fs.existsSync(coherencePath)) {
      const report = JSON.parse(fs.readFileSync(coherencePath, 'utf-8'));
      report.regions = buildRegionSourceAudit(
        conditions,
        parseSpotsWithRegions(),
        calibrationRefsBySpot,
      );
      report.regionsAuditedAt = new Date().toISOString();

      // ── Fonte anexada NÃO é a mais próxima (aviso na UI) ─────────────────
      // Para os spots listados nas anomalias `regions[].notClosest`, anexa
      // `observedWaveNotClosest` à row: a fonte vencedora do observedWave foi
      // mantida apesar de existir uma boia alternativa mais próxima. A UI
      // mostra o aviso junto do card de onda observada (ℹ fonte mais distante
      // que a alternativa), lendo esta auditoria via conditions.json — o mesmo
      // mecanismo do CoherenceRefused/Warning.
      const notClosestBySpot = new Map();
      for (const r of Object.values(report.regions ?? {})) {
        for (const a of r.notClosest ?? []) {
          if (a?.spot) notClosestBySpot.set(a.spot, a);
        }
      }
      for (const [spotId, a] of notClosestBySpot) {
        if (!conditions[spotId]) continue;
        conditions[spotId].observedWaveNotClosest = {
          winner: a.winner,
          reason: a.reason ?? null,
          attachedKm: a.attachedKm,
          altKm: a.altKm,
        };
      }
      // Remove o flag de rows que deixaram de ser anómalas (auditoria re-corrida).
      for (const spotId of Object.keys(conditions)) {
        if (!notClosestBySpot.has(spotId)) delete conditions[spotId].observedWaveNotClosest;
      }
      // Persiste de novo (o bloco de regions foi derivado de conditions, que
      // agora ganhou o flag para a UI).
      const condTmp = `${conditionsPath}.tmp`;
      fs.writeFileSync(condTmp, JSON.stringify(conditions, null, 2));
      fs.renameSync(condTmp, conditionsPath);

      // ── Histórico do gate cross-border (recusas por boia ES) ─────────────
      // Acumula, no próprio buoy-coherence.json, o dia / conta de spots que o
      // merge recusou por incoerência do par ES×PT — para auditar QUANTAS
      // vezes o gate disparou e PORQUÊ (o par que falhou), ao longo de meses,
      // não só o estado binário de hoje. Preservado pelo check-buoy-coherence.
      const day = report.day;
      const refusals = [...refusedByCode.entries()].map(([code, spots]) => ({
        code,
        name: wmoBuoys?.buoys?.[code]?.name ?? `ES ${code}`,
        spots,
        reason: gateRefusalReason(coherenceReport, code),
        verdict: 'incoherent',
      }));
      if (refusals.length > 0 && day) {
        report.gateHistory = mergeGateRun(report.gateHistory, refusals, day);
        const gatedDays = Object.values(report.gateHistory.byCode).reduce(
          (s, r) => s + r.dayCount,
          0,
        );
        console.log(
          `🔒 Histórico do gate: ${refusals.length} boias ES recusadas hoje (${gatedDays} dias acumulados em buoy-coherence.json.gateHistory)`,
        );
      }

      const tmp = `${coherencePath}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
      fs.renameSync(tmp, coherencePath);
      const anomalies = Object.values(report.regions).filter((r) => r.attachedNotClosest > 0);
      console.log(
        `🗺️  Coerência por região (fonte anexada vs boia mais próxima): ${Object.keys(report.regions).length} regiões · ${anomalies.length} com fonte não-closest`,
      );
    }
  } catch (err) {
    console.warn(`⚠️ Region source audit skipped (buoy-coherence.json): ${err.message}`);
  }
  console.log(
    `✅ observed on ${withObserved} spots (≤${MAX_STATION_DISTANCE_KM} km, ≤3h) — IPMA: ${ipmaWins}, Ecowitt: ${ecowittWins}, METAR: ${metarWins}`,
  );
  console.log(
    `✅ observedWave on ${withWave} spots (IH: ${withWave - wmoFallback}, WMO/Copernicus fallback: ${wmoFallback}, ambas as fontes: ${withBothSources})`,
  );
  if (refusedWmo > 0) {
    console.warn(`🔒 ${refusedWmo} spots com WMO recusada por coerência (par ES×PT incoherent) — observedWave cai para IH-only ou fica sem leitura.`);
  }

  return { withObserved, withWave, wmoFallback, refusedWmo, ecowittWins, ipmaWins, metarWins, ecowittSnapshot };
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  mergeObservations().catch((err) => {
    console.error('❌ merge-observations failed:', err.message);
    process.exit(1);
  });
}
