const { applyWaveBias, MIN_BIAS_N, MIN_BIAS_M } = require('./buoyBias');

function confidenceFromPrevious(prev) {
  if (!prev?.confidenceDetail) {
    return {
      confidence: 'média',
      confidenceDetail: {
        waveSpread: 0,
        windSpread: 0,
        waveSpreadPct: 0,
        windSpreadPct: 0,
        combinedSpreadPct: 0,
        degraded: true,
      },
      dailyConfidence: prev?.dailyConfidence ?? [],
    };
  }
  return {
    confidence: prev.confidence ?? 'média',
    confidenceDetail: {
      waveSpread: prev.confidenceDetail.waveSpread ?? 0,
      windSpread: prev.confidenceDetail.windSpread ?? 0,
      waveSpreadPct: prev.confidenceDetail.waveSpreadPct ?? 0,
      windSpreadPct: prev.confidenceDetail.windSpreadPct ?? 0,
      combinedSpreadPct: prev.confidenceDetail.combinedSpreadPct ?? 0,
      degraded: true,
    },
    dailyConfidence: prev.dailyConfidence ?? [],
  };
}

function applyWaveBiasToRow(current, region, waveBias, enabled) {
  const clone = { ...current };
  const meta = applyWaveBias(clone, region, waveBias, enabled);
  return meta ? { ...clone, waveBias: meta } : clone;
}

function applyAliasSpots(aliasSpots, allConditions, allForecasts, log = console) {
  const copied = [];
  for (const spot of aliasSpots) {
    const srcId = spot.conditionsSource;
    if (!allConditions[srcId]) {
      log.error(`  ✗ ${spot.id}: conditionsSource "${srcId}" not found — fetch source spot first`);
      continue;
    }
    allConditions[spot.id] = JSON.parse(JSON.stringify(allConditions[srcId]));
    allForecasts[spot.id] = allForecasts[srcId];
    copied.push(spot.id);
    log.log(`  ↳ ${spot.id} ← ${srcId} (no API)`);
  }
  return copied;
}

function wavePowerKwPerM(heightM, periodS) {
  if (!heightM || !periodS || heightM <= 0 || periodS <= 0) return 0;
  return 0.5 * heightM * heightM * periodS;
}

const SWELL_TRAIN_MIN_HEIGHT_M = 0.1;

function wavePowerFromMarine({ swellHeight, swellPeriod, waveHeight, wavePeriod }) {
  if (swellHeight > SWELL_TRAIN_MIN_HEIGHT_M && swellPeriod > 0) {
    return wavePowerKwPerM(swellHeight, swellPeriod);
  }
  return wavePowerKwPerM(waveHeight || 0, wavePeriod || 0);
}

function pickSwellTrain(height, period, direction) {
  if (height == null || height < SWELL_TRAIN_MIN_HEIGHT_M || period == null || period <= 0) return null;
  return { height, period, direction: direction ?? 0 };
}

function getTideStatus(seaLevel, seaLevelNext) {
  const threshold = 0.5;
  if (seaLevel > threshold) return { status: 'high', label: 'Maré Alta' };
  if (seaLevel < -threshold) return { status: 'low', label: 'Maré Baixa' };
  if (seaLevelNext !== undefined && seaLevelNext > seaLevel) return { status: 'rising', label: 'Maré a Subir' };
  return { status: 'falling', label: 'Maré a Descer' };
}

module.exports = {
  MIN_BIAS_N,
  MIN_BIAS_M,
  confidenceFromPrevious,
  applyWaveBiasToRow,
  applyAliasSpots,
  wavePowerKwPerM,
  wavePowerFromMarine,
  pickSwellTrain,
  getTideStatus,
  SWELL_TRAIN_MIN_HEIGHT_M,
};
