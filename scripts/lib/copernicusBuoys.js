/**
 * Copernicus Marine in-situ WMO buoys — independent, keyless wave source.
 *
 * The Puertos del Estado deep-water buoys (6200024/25, 6200083–85) left the
 * Copernicus in-situ pipeline in Oct 2025, and the EMODnet ERDDAP mirrors the
 * same gap. What IS live on the keyless S3 bucket (`mdl-native-01`) are the
 * Portuguese Datawell WMO buoys 6201077 (off Porto) and 6201079 (off Faro) —
 * the same instruments the IH serves via its keyed REST API, ingested here
 * through an INDEPENDENT route (WMO/GTS → Copernicus).
 *
 * That makes this layer a real *fallback* for the IH observedWave: when the
 * IH API is down, stale, or the key is missing, a fresh reading from these
 * buoys still reaches conditions.json — no fake data, just a second source.
 *
 * The platform catalog keeps the Spanish codes too — verified live on
 * 2026-08-14 that Puertos del Estado is reporting again (`IR_TS_MO_*` daily
 * files, hourly observations): Cabo Silleiro, Villano-Sisargas, Bilbao, …
 * now cover Galicia/Cantabria on their own, cross-border. Buoys are only
 * attached when they carry a fresh reading in today's file.
 *
 * Note on freshness: the Copernicus NRT ingestion lags a few hours for the
 * Portuguese WMO buoys (file rewritten ~15:10 UTC may still hold the ~08:00
 * reading), while the Spanish hourly series is near real-time. The layer's
 * gate is therefore 6 h (vs 3 h for IH/wind) — see isFreshReading and the
 * source-aware frontend gate isObservedWaveFresh.
 *
 * NetCDF-4 parsing uses `h5wasm` (pure WASM, NODERAWFS build) — no native
 * compilation, works on any Node ≥18 runner.
 *
 * @see https://data.marine.copernicus.eu/product/INSITU_GLO_PHYBGCWAV_DISCRETE_MYNRT_013_030/description
 */

const S3_BASE = 'https://s3.waw3-1.cloudferro.com/mdl-native-01';
const S3_PREFIX =
  'native/INSITU_GLO_PHYBGCWAV_DISCRETE_MYNRT_013_030/' +
  'cmems_obs-ins_glo_phybgcwav_mynrt_na_irr_202311/latest/';

/** WMO platform codes tracked by this layer (PT live, ES reporting again). */
const PLATFORM_CATALOG = [
  { code: '6201077', name: 'Datawell ao largo do Porto', area: 'Porto', country: 'PT' },
  { code: '6201079', name: 'Datawell ao largo de Faro', area: 'Faro', country: 'PT' },
  // Nazaré Costeira (Fugro Wavescan CSA88/2, o mesmo instrumento que o IH serve
  // via getDatawellData) — verificado a reportar à Copernicus em 2026-08-28/31
  // (`IR_TS_MO_6200199_*.nc`, série horária com hm0/tp/hmax/sst). Dá observedWave
  // à Costa de Prata/Lisboa sem depender da IH_API_KEY.
  { code: '6200199', name: 'Nazaré Costeira (WMO)', area: 'Nazaré', country: 'PT' },
  { code: '6200024', name: 'Bilbao', area: 'Cantábrico', country: 'ES' },
  { code: '6200025', name: 'Cabo Peñas', area: 'Astúrias', country: 'ES' },
  { code: '6200083', name: 'Villano-Sisargas', area: 'Galiza', country: 'ES' },
  { code: '6200084', name: 'Cabo Silleiro', area: 'Galiza', country: 'ES' },
  { code: '6200085', name: 'Golfo de Cádiz', area: 'Andaluzia', country: 'ES' },
  { code: '6202400', name: 'Açores (WMO)', area: 'Açores', country: 'PT' },
  { code: '6202402', name: 'Açores (WMO)', area: 'Açores', country: 'PT' },
];

/**
 * Regex gerada do catálogo — um código novo no PLATFORM_CATALOG entra na
 * descoberta automaticamente (o bug do 6200199 foi exactamente um catálogo e
 * uma regex que divergiram; com isto é impossível).
 */
const PLATFORM_CODE_RE = new RegExp(
  `_TS_MO_(${PLATFORM_CATALOG.map((p) => p.code).join('|')})_\\d{8}\\.nc$`,
);

const CATALOG_BY_CODE = Object.fromEntries(PLATFORM_CATALOG.map((p) => [p.code, p]));

/** Codes of the Spanish (Puertos del Estado) route — the cross-border layer. */
const ES_BUOY_CODES = PLATFORM_CATALOG.filter((p) => p.country === 'ES').map((p) => p.code);

/**
 * Códigos WMO nacionais (PT) keyless acumulados além da rota ES: a Nazaré
 * Costeira 6200199 serve o forecast-skill como fonte PT (origem 'wmo-pt') sem
 * depender da IH_API_KEY — o best_match dos spots da Costa de Prata/Lisboa
 * cruza com as leituras WMO desta boia. Lista explícita (não derivada do
 * país, para não arrastar 6201077/6201079/Açores que têm tratamento próprio).
 */
const PT_KEYLESS_WMO_CODES = ['6200199'];

/** Todos os códigos WMO keyless acumulados num wmo-bias-archive.json (ES + PT). */
const KEYLESS_WMO_CODES = [...new Set([...ES_BUOY_CODES, ...PT_KEYLESS_WMO_CODES])];

/**
 * Origem (plataforma) de um código WMO keyless no forecast-skill: PT nacional
 * (6200199) → 'wmo-pt'; qualquer outro WMO → 'wmo-es'. Mantém os contadores
 * por plataforma honestos (o total misto esconderia a cobertura nacional).
 */
function wmoOriginForWmoCode(code) {
  return PT_KEYLESS_WMO_CODES.includes(String(code)) ? 'wmo-pt' : 'wmo-es';
}

/**
 * Ponte keyless da Costa de Prata: enquanto a IH_API_KEY não provar a Fugro
 * (estação 2, Nazaré Costeira — a mesma boia que a rota WMO 6200199 serve),
 * os spots nazaré/são-martinho-porto/baleal ficariam sem observedWave quando a
 * leitura nacional (IH ou WMO 6200199) estiver stale. Anexa a Cabo Silleiro
 * (6200084, ES — série horária quase em tempo real) como proxy keyless quando
 * a leitura ES estiver fresca. A distância real (≈280-300 km) é mantida — a UI
 * mostra «a X km» honestamente — e o payload marca `bridge` para a UI distinguir
 * o proxy da leitura nacional. Auto-desactiva: quando a Fugro (IH ou WMO 6200199)
 * voltar a ter leitura fresca, o merge usa-a e a ponte nunca é anexada.
 */
const KEYLESS_BRIDGE_ES_CODE = '6200084';
const KEYLESS_BRIDGE_SPOT_IDS = ['nazare', 'sao-martinho-porto', 'baleal'];

/** Nearest-buoy mapping radius (km). Generous: only ~2 live mainland buoys. */
const MAX_BUOY_MAP_KM = 250;
/** Max distance to ATTACH a WMO reading to a spot (km). */
const MAX_BUOY_ATTACH_KM = 200;
/**
 * Freshness gate for the WMO layer — 6h, wider than IH/wind (3h) because the
 * Copernicus NRT ingestion lags several hours for some platforms (measured:
 * PT buoy file rewritten 15:10 UTC still carrying the 08:02 reading). The
 * frontend mirrors this with isObservedWaveFresh (source-aware).
 */
const MAX_OBS_AGE_HOURS = 6;

/** NetCDF `_FillValue` for F32 missing data (9.9692…e36). */
const FILL_THRESHOLD = 1e30;
/** Copernicus in-situ NetCDF TIME is days since 1950-01-01 00:00 UTC. */
const DAYS_1950_TO_1970 = 7305;

/** Deterministic UTC day key for the S3 `latest/` folder (YYYYMMDD). */
function dayKey(nowMs = Date.now()) {
  return new Date(nowMs).toISOString().slice(0, 10).replace(/-/g, '');
}

/** days-since-1950-01-01 → ISO string (UTC). */
function epochDaysToIso(days) {
  const n = Number(days);
  if (!Number.isFinite(n)) return null;
  const ms = (n - DAYS_1950_TO_1970) * 86400000;
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/**
 * Paginated S3 ListObjectsV2 of `latest/<day>/`, returning only keys that
 * match a catalogued WMO platform (`*_TS_MO_<code>_<date>.nc`).
 * @param {string} [day] YYYYMMDD
 * @param {typeof fetch} [fetchImpl]
 * @param {string} [base]
 * @param {string} [prefix]
 * @returns {Promise<Array<{ key: string, code: string }>>}
 */
async function listDayWaveKeys(
  day = dayKey(),
  fetchImpl = fetch,
  base = S3_BASE,
  prefix = S3_PREFIX,
) {
  const url = (token) => {
    const u = `${base}/?list-type=2&prefix=${prefix}${day}/&max-keys=2000`;
    return token ? `${u}&continuation-token=${encodeURIComponent(token)}` : u;
  };

  const keys = [];
  let token = '';
  for (let i = 0; i < 10; i++) {
    const res = await fetchImpl(url(token));
    if (!res.ok) throw new Error(`S3 list HTTP ${res.status}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
      const key = m[1];
      // Only the time-series wave file (`_TS_MO_`) — the `_WS_MO_` sibling
      // duplicates the platform; one parse per buoy is enough.
      const codeMatch = key.match(PLATFORM_CODE_RE);
      if (codeMatch) keys.push({ key, code: codeMatch[1] });
    }
    const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
    if (!next) break;
    token = next[1];
  }
  return keys;
}

/**
 * Download one NetCDF file into a Buffer.
 * @param {string} key full S3 key
 * @param {typeof fetch} [fetchImpl]
 * @param {string} [base]
 * @returns {Promise<Buffer>}
 */
async function fetchNetCdfBytes(key, fetchImpl = fetch, base = S3_BASE) {
  const res = await fetchImpl(`${base}/${key}`, {
    headers: { Accept: 'application/octet-stream' },
  });
  if (!res.ok) throw new Error(`S3 GET HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`S3 GET returned tiny file (${buf.length} B)`);
  return buf;
}

/** h5wasm `value` returns scalars/arrays/objects inconsistently — normalise. */
function toFlatArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  if (typeof value === 'number') return [value];
  if (typeof value === 'string') return [value];
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort((a, b) => Number(a) - Number(b));
    return keys.map((k) => value[k]);
  }
  return [value];
}

/**
 * Parse a Copernicus NetCDF-4 wave file (h5wasm/node, NODERAWFS).
 * Writes the buffer to a temp file because h5wasm opens by path.
 * @param {Buffer} buf
 * @returns {Promise<object>} raw arrays + station identity
 */
async function parseNetCdf(buf) {
  const os = await import('os');
  const path = await import('path');
  const fs = await import('fs');
  const tmpPath = path.join(
    os.tmpdir(),
    `ventu-wmo-${process.pid}-${Math.random().toString(36).slice(2)}.nc`,
  );
  fs.writeFileSync(tmpPath, buf);
  try {
    const mod = await import('h5wasm/node');
    await mod.ready;
    const f = new mod.File(tmpPath, 'r');
    try {
      const raw = {};
      for (const [name, obj] of f.items()) {
        if (obj && obj.value !== undefined) raw[name] = obj.value;
      }
      return raw;
    } finally {
      f.close();
    }
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
}

/** Copernicus variable aliases: PT files use VGHS/VDIR, ES files VHM0/VMDR. */
const HS_ALIASES = ['VGHS', 'VHM0'];
const DIR_ALIASES = ['VDIR', 'VMDR'];

/**
 * Walk every valid surface row of a parsed NetCDF wave file (oldest first),
 * applying the same rules as surfaceReading: within a row the depth level
 * closest to the surface (DEPH==0) is preferred, and a value is accepted only
 * when it is not the F32 fill value and its `_QC` flag is 1 (good). Rows
 * without a valid wave height are skipped.
 *
 * Handles both layouts seen live:
 * - PT Datawell files: TIME [1], wave vars [1,3], DEPH [0,0,0.5];
 * - ES Puertos del Estado files: TIME [17] (hourly), vars [17,3], DEPH [-3,0,3].
 *
 * @param {object} raw parsed file (keys = variable names)
 * @yields {{ date: string, lat: number, lon: number, station: string, hs: number, tp?: number, dir?: number, hmax?: number, sst?: number }}
 */
function* walkRows(raw) {
  if (!raw || typeof raw !== 'object') return;

  const lat = Number(raw.LATITUDE);
  const lon = Number(raw.LONGITUDE);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  const station = toFlatArray(raw.STATION).join('').trim();

  const timeVals = toFlatArray(raw.TIME).map(Number).filter(Number.isFinite);
  if (!timeVals.length) return;

  // Depth axis. Two live layouts:
  // - ES (Puertos del Estado): DEPH is a GLOBAL axis, e.g. [-3,0,3] (3 levels);
  // - PT (Datawell): DEPH is ROW-MAJOR — one slice per observation
  //   (measured live: [0,0,0.5, 0,0,0.5, …] for 6 observations → 18 values).
  // Derive depthCount from the wave array length / row count and use the first
  // slice as the axis when DEPH is row-major (length == wave length).
  const dephFlat = toFlatArray(raw.DEPH)
    .map(Number)
    .filter(Number.isFinite);
  const waveLen = Math.max(
    0,
    ...[HS_ALIASES, DIR_ALIASES, ['VTPK'], ['VZMX'], ['TEMP']].flatMap((aliases) =>
      aliases.filter((n) => raw[n] !== undefined).map((n) => toFlatArray(raw[n]).length),
    ),
  );
  const rowCount = Math.max(timeVals.length, Math.ceil(waveLen / Math.max(1, dephFlat.length)));
  const depthCount =
    dephFlat.length > 0 && waveLen % dephFlat.length === 0 && dephFlat.length < waveLen
      ? dephFlat.length // global axis (ES): DEPH length divides the wave array
      : Math.max(1, Math.round(waveLen / rowCount)); // row-major / derived (PT)
  const depthAxis =
    dephFlat.length === depthCount ? dephFlat : dephFlat.slice(0, depthCount);
  // Prefer the surface level (DEPH==0), then the closest level to it.
  const depthOrder = (depthAxis.length ? depthAxis : [0])
    .map((d, i) => ({ i, d }))
    .sort((a, b) => {
      const ka = a.d === 0 ? 0 : 1 + Math.abs(a.d) / 100;
      const kb = b.d === 0 ? 0 : 1 + Math.abs(b.d) / 100;
      return ka - kb || a.i - b.i;
    })
    .map((x) => x.i);

  const flatVar = (name) => (raw[name] !== undefined ? toFlatArray(raw[name]) : []);
  const pickInRow = (aliases, row) => {
    for (const name of aliases) {
      if (raw[name] === undefined) continue;
      const values = flatVar(name);
      const qc = flatVar(`${name}_QC`);
      for (const di of depthOrder) {
        const idx = row * depthCount + di;
        const v = Number(values[idx]);
        if (!Number.isFinite(v) || v >= FILL_THRESHOLD) continue;
        if (qc.length > idx && Number(qc[idx]) !== 1) continue;
        return v;
      }
    }
    return null;
  };

  for (let row = 0; row < rowCount; row++) {
    const hs = pickInRow(HS_ALIASES, row);
    if (hs == null) continue;
    const date = epochDaysToIso(timeVals[row] ?? timeVals[timeVals.length - 1]);
    if (!date) continue;

    const out = { date, lat, lon, station, hs };
    const tp = pickInRow(['VTPK'], row);
    const dir = pickInRow(DIR_ALIASES, row);
    const hmax = pickInRow(['VZMX'], row);
    const sst = pickInRow(['TEMP'], row);
    if (tp != null && tp >= 0) out.tp = tp;
    if (dir != null && dir >= 0 && dir <= 360) out.dir = dir;
    if (hmax != null && hmax >= 0) out.hmax = hmax;
    if (sst != null) out.sst = sst;
    yield out;
  }
}

/**
 * ALL valid surface rows of a parsed NetCDF file (oldest → newest). Used by
 * the cross-border coherence check to compare buoys on overlapping hours.
 * @param {object} raw parsed file (keys = variable names)
 * @returns {Array<{ date: string, lat: number, lon: number, station: string, hs: number, tp?: number, dir?: number, hmax?: number, sst?: number }>}
 */
function surfaceSeries(raw) {
  return [...walkRows(raw)];
}

/**
 * LATEST valid surface reading of a parsed NetCDF file (or null).
 * @param {object} raw parsed file (keys = variable names)
 * @returns {{ date: string, lat: number, lon: number, station: string, hs: number, tp?: number, dir?: number, hmax?: number, sst?: number } | null}
 */
function surfaceReading(raw) {
  const rows = [...walkRows(raw)];
  return rows.length ? rows[rows.length - 1] : null;
}

/**
 * Freshness gate for a WMO reading — 6h to absorb the Copernicus NRT
 * ingestion lag (the frontend mirrors this in isObservedWaveFresh).
 * @param {string} iso
 * @param {number} [nowMs]
 * @param {number} [maxHours]
 * @returns {boolean}
 */
function isFreshReading(iso, nowMs = Date.now(), maxHours = MAX_OBS_AGE_HOURS) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  const ageHours = (nowMs - t) / 3_600_000;
  return ageHours >= 0 && ageHours <= maxHours;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Map spots to their nearest WMO buoy WITH a fresh reading today.
 * @param {Array<{ id: string, lat: number, lon: number }>} spots
 * @param {Record<string, object>} buoys keyed by platform code
 * @param {number} [maxKm]
 * @param {number} [nowMs]
 * @returns {Record<string, { code: string, stationTitle: string, area?: string, distanceKm: number }>}
 */
function mapSpotsToWmoBuoys(spots, buoys, maxKm = MAX_BUOY_MAP_KM, nowMs = Date.now()) {
  const mapping = {};
  const live = Object.values(buoys).filter(
    (b) => b.latest && typeof b.latest.date === 'string' && isFreshReading(b.latest.date, nowMs),
  );
  for (const spot of spots) {
    let nearest = null;
    let nearestDist = Infinity;
    for (const buoy of live) {
      const dist = haversineKm(spot.lat, spot.lon, buoy.lat, buoy.lon);
      if (dist < nearestDist && dist <= maxKm) {
        nearestDist = dist;
        nearest = buoy;
      }
    }
    if (nearest) {
      mapping[spot.id] = {
        code: nearest.code,
        stationTitle: nearest.name,
        area: nearest.area,
        distanceKm: Math.round(nearestDist * 10) / 10,
      };
    }
  }
  return mapping;
}

/**
 * Find ES buoys whose accumulated readings are geographic coverage WASTED —
 * they keep accumulating in wmo-bias-archive.json but no spot maps to them in
 * wmo-buoys.json (e.g. Villano/Bilbao/Peñas, far from the PT catalog). The
 * validator warns on them so the mapping is added (or the buoy pruned)
 * instead of silently wasting the ingested readings.
 *
 * Mirrors the mapping the merge uses for observedWave (wmo-buoys.spotMapping),
 * not the geographic probe of archiveWmoSkill — this is the authoritative
 * "which spot uses which buoy" map.
 *
 * @param {object|null|undefined} wmoBiasArchive  { buoys: { code: { readings: [] } } }
 * @param {object|null|undefined} wmoBuoys        { buoys: { code: { name } }, spotMapping: { spotId: { code } } }
 * @returns {Array<{ code: string, name: string|null, readings: number }>}
 */
function findUnmappedEsBuoys(wmoBiasArchive, wmoBuoys) {
  const archive = wmoBiasArchive?.buoys;
  const mapping = wmoBuoys?.spotMapping;
  const catalog = wmoBuoys?.buoys;
  if (!archive || typeof archive !== 'object' || !mapping || typeof mapping !== 'object') {
    return [];
  }
  const mappedCodes = new Set(
    Object.values(mapping)
      .map((m) => (m && typeof m === 'object' ? String(m.code) : null))
      .filter(Boolean),
  );
  const out = [];
  for (const [code, b] of Object.entries(archive)) {
    if (!b || typeof b !== 'object' || !Array.isArray(b.readings) || b.readings.length === 0) continue;
    if (mappedCodes.has(String(code))) continue;
    out.push({
      code: String(code),
      name: catalog?.[code]?.name ?? b.name ?? null,
      readings: b.readings.length,
    });
  }
  out.sort((a, b2) => a.name?.localeCompare(b2.name ?? '') || a.code.localeCompare(b2.code));
  return out;
}

/**
 * Build the `observedWave` fallback payload for a spot from a WMO buoy.
 * Same shape as the IH layer, with source 'wmo-buoy' so the UI/audit can
 * tell the routes apart. Never invents data: requires a fresh reading.
 * @param {{ code: string, distanceKm: number }} mapping
 * @param {object} buoy station with `latest` surface reading
 * @param {{ maxKm?: number, maxAgeHours?: number, nowMs?: number }} [opts]
 * @returns {object | null}
 */
function observedWaveForSpot(mapping, buoy, opts = {}) {
  const {
    maxKm = MAX_BUOY_ATTACH_KM,
    maxAgeHours = MAX_OBS_AGE_HOURS,
    nowMs = Date.now(),
  } = opts;
  if (!mapping || !buoy) return null;
  if (mapping.distanceKm > maxKm) return null;
  const latest = buoy.latest;
  if (!latest || typeof latest !== 'object') return null;
  if (typeof latest.hs !== 'number' || !isFreshReading(latest.date, nowMs, maxAgeHours)) {
    return null;
  }

  return {
    waveHeight: latest.hs,
    wavePeriod: typeof latest.tp === 'number' ? latest.tp : undefined,
    waveDirection: typeof latest.dir === 'number' ? latest.dir : undefined,
    maxWaveHeight: typeof latest.hmax === 'number' ? latest.hmax : undefined,
    waterTemp: typeof latest.sst === 'number' ? latest.sst : undefined,
    stationName: buoy.name,
    stationArea: buoy.area,
    distanceKm: mapping.distanceKm,
    observedAt: latest.date,
    source: 'wmo-buoy',
  };
}

/**
 * observedWave keyless de ponte (Costa de Prata ← Cabo Silleiro).
 *
 * Fallback dentro do fallback WMO: só devolve leitura para os spots da ponte
 * (nazaré/são-martinho-porto/baleal) e só quando a leitura ES estiver fresca
 * (gate MAX_OBS_AGE_HOURS). Bypassa o MAX_BUOY_ATTACH_KM — é uma ponte de
 * longa distância EXPLÍCITA, por isso mantém a distância real no payload
 * (a UI mostra «boia Cabo Silleiro a ~280 km») e marca `bridge` para nunca
 * passar por leitura nacional. `stationCode` permite o merge indexar skill e
 * gate de coerência ES exactamente como uma boia ES mapeada.
 *
 * @param {{ buoys?: Record<string, { name?: string, area?: string, lat?: number, lon?: number, latest?: object }> } | null} wmoBuoys
 * @param {{ id: string, lat: number, lon: number }} spot
 * @param {{ maxAgeHours?: number, nowMs?: number }} [opts]
 * @returns {object | null}
 */
function esBridgeObservedWaveForSpot(wmoBuoys, spot, opts = {}) {
  const { maxAgeHours = MAX_OBS_AGE_HOURS, nowMs = Date.now() } = opts;
  if (!wmoBuoys || !wmoBuoys.buoys) return null;
  if (!KEYLESS_BRIDGE_SPOT_IDS.includes(spot.id)) return null;
  const buoy = wmoBuoys.buoys[KEYLESS_BRIDGE_ES_CODE];
  if (!buoy || typeof buoy !== 'object') return null;
  const latest = buoy.latest;
  if (!latest || typeof latest !== 'object') return null;
  if (typeof latest.hs !== 'number' || !isFreshReading(latest.date, nowMs, maxAgeHours)) {
    return null;
  }
  const distanceKm = haversineKm(spot.lat, spot.lon, buoy.lat, buoy.lon);
  return {
    waveHeight: latest.hs,
    wavePeriod: typeof latest.tp === 'number' ? latest.tp : undefined,
    waveDirection: typeof latest.dir === 'number' ? latest.dir : undefined,
    maxWaveHeight: typeof latest.hmax === 'number' ? latest.hmax : undefined,
    waterTemp: typeof latest.sst === 'number' ? latest.sst : undefined,
    stationName: buoy.name,
    stationArea: buoy.area,
    distanceKm: Math.round(distanceKm * 10) / 10,
    observedAt: latest.date,
    source: 'wmo-buoy',
    stationCode: KEYLESS_BRIDGE_ES_CODE,
    bridge: true,
    bridgeNote:
      'Ponte keyless: Cabo Silleiro (ES) enquanto a Fugro nacional (IH_API_KEY) não está provada.',
  };
}

module.exports = {
  S3_BASE,
  S3_PREFIX,
  PLATFORM_CATALOG,
  PLATFORM_CODE_RE,
  CATALOG_BY_CODE,
  ES_BUOY_CODES,
  PT_KEYLESS_WMO_CODES,
  KEYLESS_WMO_CODES,
  wmoOriginForWmoCode,
  KEYLESS_BRIDGE_ES_CODE,
  KEYLESS_BRIDGE_SPOT_IDS,
  MAX_BUOY_MAP_KM,
  MAX_BUOY_ATTACH_KM,
  MAX_OBS_AGE_HOURS,
  dayKey,
  epochDaysToIso,
  listDayWaveKeys,
  fetchNetCdfBytes,
  parseNetCdf,
  toFlatArray,
  walkRows,
  surfaceSeries,
  surfaceReading,
  isFreshReading,
  haversineKm,
  findUnmappedEsBuoys,
  mapSpotsToWmoBuoys,
  observedWaveForSpot,
  esBridgeObservedWaveForSpot,
};
