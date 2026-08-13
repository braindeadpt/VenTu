/**
 * Gate de ativação do `IH_EDR_FALLBACK` — valida o schema REAL das features
 * EDR contra o `stationFromFeature` ANTES de ativar a flag no update-data.yml.
 *
 * Quando o backend de marés IH recuperar do incidente (ver docs/BACKLOG.md
 * "Marés"), o `items` volta a responder — mas o fallback EDR usa o `radius`,
 * e as features desse endpoint podem ter schema diferente. Este script faz o
 * probe real com as coordenadas das estações conhecidas (do último
 * ih-tides.json — marégrafos fixos) e verifica que o `stationFromFeature`
 * consegue parsear TUDO o que o radius devolve (codp, last_sea_surface_height,
 * fallback de geometry) antes de se ativar a flag.
 *
 * Usage:
 *   npm run ih:validate          # gate completo (exit 0/1/2)
 *   IH_VALIDATE_MAX=5 npm run ih:validate   # mais estações no sample
 *
 * Exit codes:
 *   0 — schema validado: radius respondeu e todas as features batem com o
 *       `stationFromFeature` → `IH_EDR_FALLBACK=1` PODE ser ativado.
 *   1 — schema NÃO bate (features mudaram) → NÃO ativar; atualizar o
 *       `stationFromFeature` primeiro.
 *   2 — backend ainda em baixo / sem coordenadas conhecidas / sem features →
 *       nada a validar; voltar a correr quando o IH recuperar.
 */

const {
  stationFromFeature,
  edrRadiusUrl,
  lastKnownStations,
  IH_API,
  EDR_SAMPLE_STATIONS,
} = require('./fetch-ih-tides.js');

async function fetchJson(url) {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/geo+json, application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { status: res.status, data: null };
    return { status: res.status, data: await res.json() };
  } catch {
    return { status: 0, data: null };
  }
}

/** Valida UMA feature EDR contra o que o stationFromFeature espera. */
function validateFeature(feature) {
  const issues = [];
  const p = feature.properties || {};

  if (p.codp == null) issues.push('properties.codp ausente');
  if (p.title == null) issues.push('properties.title ausente');

  const hasNewObs = p.last_sea_surface_height != null && p.last_date_time != null;
  const hasOldObs = p.last_obs != null && p.last_data != null;
  if (!hasNewObs && !hasOldObs) {
    issues.push(
      'obs ausente — nem last_sea_surface_height/last_date_time nem aliases last_obs/last_data'
    );
  }

  const hasPropsLatLon = Number.isFinite(p.lat) && Number.isFinite(p.lon);
  const hasGeom =
    feature.geometry &&
    Array.isArray(feature.geometry.coordinates) &&
    feature.geometry.coordinates.length >= 2 &&
    feature.geometry.coordinates.every((n) => Number.isFinite(n));
  if (!hasPropsLatLon && !hasGeom) {
    issues.push('posição ausente — nem p.lat/p.lon nem geometry.coordinates');
  }

  // A prova final: o parser real do pipeline tem de aceitar a feature.
  const parsed = stationFromFeature(feature);
  if (!parsed) issues.push('stationFromFeature devolveu null (parse falhou)');

  return {
    issues,
    parsed,
    needsGeometryFallback: !hasPropsLatLon && hasGeom,
    schema: hasNewObs ? 'novo (2026)' : hasOldObs ? 'velho (alias)' : '—',
  };
}

async function main() {
  const known = lastKnownStations();
  if (known.length === 0) {
    console.error(
      '❌ Sem estações conhecidas (falta public/data/ih-tides.json com lat/lon) — nada a validar.'
    );
    process.exitCode = 2;
    return;
  }

  const max = Math.min(
    parseInt(process.env.IH_VALIDATE_MAX || String(EDR_SAMPLE_STATIONS), 10) ||
      EDR_SAMPLE_STATIONS,
    known.length
  );
  const sample = known.slice(0, max);

  // Contexto: o items está UP? (se sim, a flag ainda não é necessária — mas o
  // schema do radius deve estar validado para quando for.)
  const itemsUrl = `${IH_API}/collections/tide_obs_nrt/items?limit=1&f=json`;
  const items = await fetchJson(itemsUrl);
  console.log(
    items.status === 200
      ? `ℹ️  items: UP (HTTP 200) — fallback ainda não necessário, schema a validar à mesma`
      : `ℹ️  items: DOWN (HTTP ${items.status}) — fallback EDR é o caminho atual`
  );

  console.log(`\n🔍 Probing EDR radius com ${sample.length} estações conhecidas…\n`);
  const results = [];
  for (const s of sample) {
    const url = edrRadiusUrl(s.lat, s.lon);
    const { status, data } = await fetchJson(url);
    const features = status === 200 && data && Array.isArray(data.features) ? data.features : [];
    console.log(
      `  ${s.title || s.codp} (${s.lat}, ${s.lon}): HTTP ${status} · ${features.length} features`
    );
    results.push({ station: s, status, features });
  }

  const responding = results.filter((r) => r.status === 200 && r.features.length > 0);
  const issuesAll = [];
  let totalFeatures = 0;
  let geometryFallbacks = 0;
  const schemas = new Set();

  for (const r of responding) {
    for (const f of r.features) {
      totalFeatures += 1;
      const v = validateFeature(f);
      schemas.add(v.schema);
      if (v.needsGeometryFallback) geometryFallbacks += 1;
      if (v.issues.length > 0) {
        issuesAll.push({ station: r.station, feature: v.parsed || f, issues: v.issues });
      }
    }
  }

  const downCount = results.filter((r) => r.status !== 200).length;
  if (downCount > 0) {
    console.log(`\n⚠️  ${downCount}/${results.length} estações sondadas não responderam com features.`);
  }

  if (issuesAll.length > 0) {
    console.error('\n❌ SCHEMA EDR NÃO bate com o stationFromFeature — NÃO ativar IH_EDR_FALLBACK=1:');
    for (const bad of issuesAll) {
      console.error(`  - ${bad.station.title || bad.station.codp}: ${bad.issues.join('; ')}`);
    }
    process.exitCode = 1;
    return;
  }

  if (totalFeatures === 0) {
    console.error(
      '\n⏳ Nenhuma estação devolveu features (backend ainda em baixo?) — nada a validar. Voltar a correr quando o IH recuperar.'
    );
    process.exitCode = 2;
    return;
  }

  console.log(
    `\n✅ SCHEMA EDR OK — ${totalFeatures} features validadas contra stationFromFeature` +
      ` (schema ${[...schemas].join(' + ')}, ${geometryFallbacks} com fallback de geometry).` +
      `\n   IH_EDR_FALLBACK=1 PODE ser ativado (update-data.yml, passo Fetch IH Tide Station Data).`
  );
  process.exitCode = 0;
}

main();
