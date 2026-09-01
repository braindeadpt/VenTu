function validateCoverage(spots, allConditions, log = console) {
  const primaryIds = spots.filter((spot) => !spot.conditionsSource).map((spot) => spot.id);
  const failedPrimary = primaryIds.filter((id) => !allConditions[id]);
  if (failedPrimary.length > 0) {
    log.warn(`⚠️ ${failedPrimary.length} primary spots failed: ${failedPrimary.slice(0, 8).join(', ')}${failedPrimary.length > 8 ? '…' : ''}`);
  }
  const minOk = Math.ceil(primaryIds.length * 0.95);
  const okPrimary = primaryIds.length - failedPrimary.length;
  return { primaryIds, failedPrimary, minOk, okPrimary, spotCount: Object.keys(allConditions).length };
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

function buildPipelineLayers({ metaRoot, previousMeta, loadBuoyLayerStatus, applyBuoyLayerStreak, loadRadarLayerStatus, loadWarningsLayerStatus, applyLayerStreak, buildCoastalWarningsLayer }) {
  return {
    buoyLayer: applyBuoyLayerStreak(loadBuoyLayerStatus(metaRoot), previousMeta),
    radarLayer: applyLayerStreak(loadRadarLayerStatus(metaRoot), previousMeta, 'radarLayer'),
    warningsLayer: applyLayerStreak(loadWarningsLayerStatus(metaRoot), previousMeta, 'warningsLayer'),
    coastalWarningsLayer: buildCoastalWarningsLayer(metaRoot, previousMeta),
  };
}

module.exports = { validateCoverage, assertCoverage, buildPipelineLayers };
