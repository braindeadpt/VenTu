function validateCoverage(spots, allConditions, log = console, { carriedIds } = {}) {
  const carried = carriedIds instanceof Set ? carriedIds : new Set(carriedIds ?? []);
  const primaryIds = spots.filter((spot) => !spot.conditionsSource).map((spot) => spot.id);
  // Carry-over = dados do run anterior reaproveitados: a entrada existe em
  // allConditions (o site fica servido) mas o fetch FALHOU — conta como falha,
  // nunca como sucesso, para o gate não esconder um outage real.
  const carriedPrimary = primaryIds.filter((id) => carried.has(id));
  const failedPrimary = primaryIds.filter((id) => !allConditions[id] || carried.has(id));
  const droppedPrimary = primaryIds.filter((id) => !allConditions[id]);
  if (failedPrimary.length > 0) {
    log.warn(`⚠️ ${failedPrimary.length} primary spots failed: ${failedPrimary.slice(0, 8).join(', ')}${failedPrimary.length > 8 ? '…' : ''} — ${carriedPrimary.length} reaproveitado(s) do run anterior, ${droppedPrimary.length} apagado(s)`);
  }
  const minOk = Math.ceil(primaryIds.length * 0.95);
  const okPrimary = primaryIds.length - failedPrimary.length;
  return { primaryIds, failedPrimary, carriedPrimary, droppedPrimary, minOk, okPrimary, spotCount: Object.keys(allConditions).length };
}

function assertCoverage(coverage, exit = (code) => process.exit(code), log = console) {
  if (coverage.okPrimary < coverage.minOk) {
    log.error(`\n❌ ERROR: Only ${coverage.okPrimary}/${coverage.primaryIds.length} primary spots fetched (need ≥${coverage.minOk}). Not writing.`);
    exit(1);
  }
  if (coverage.spotCount === 0) {
    log.error('\n❌ ERROR: No conditions fetched! Not writing empty file.');
    exit(1);
  }
}

function buildPipelineLayers({ metaRoot, previousMeta, loadBuoyLayerStatus, applyBuoyLayerStreak, loadRadarLayerStatus, loadSatLayerStatus, loadWarningsLayerStatus, applyLayerStreak, buildCoastalWarningsLayer, loadTidesLayerStatus }) {
  return {
    buoyLayer: applyBuoyLayerStreak(loadBuoyLayerStatus(metaRoot), previousMeta),
    radarLayer: applyLayerStreak(loadRadarLayerStatus(metaRoot), previousMeta, 'radarLayer'),
    satLayer: applyLayerStreak(loadSatLayerStatus(metaRoot), previousMeta, 'satLayer'),
    warningsLayer: applyLayerStreak(loadWarningsLayerStatus(metaRoot), previousMeta, 'warningsLayer'),
    coastalWarningsLayer: buildCoastalWarningsLayer(metaRoot, previousMeta),
    tideLayer: applyLayerStreak(loadTidesLayerStatus(metaRoot), previousMeta, 'tideLayer'),
  };
}

module.exports = { validateCoverage, assertCoverage, buildPipelineLayers };
