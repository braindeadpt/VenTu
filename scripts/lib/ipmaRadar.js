/**
 * IPMA radar — machine-readable manifest + georeferenced PNG frames.
 *
 * Investigation result: the IPMA has NO public WMTS/tile endpoint for radar
 * (the sig.ipma.pt / geoserver paths are dead). What exists and is stable:
 *
 *   Manifest:  https://www.ipma.pt/resources.www/transf/radar/imgs-radar.json
 *              → { "Portugal": [{ "date": "2026-08-14 18:35", "path": "pcr-2026-08-14T1835.png" }, ...] }
 *              (5-minute cadence, newest first, no random directories)
 *
 *   Frames:    https://www.ipma.pt/resources.www/transf/radar/por/{path}
 *              Transparent PNG (alpha) of just the radar echoes — designed for
 *              map overlay (IPMA's own Leaflet page uses opacity 0.8).
 *
 *   Bounds:    The IPMA map builder overlays these frames with:
 *              new L.LatLngBounds([34.011513, -12.454795], [43.792862, -4.345465])
 *              (see mapbuilder-pt.js on www.ipma.pt/pt/otempo/obs.remote/)
 *
 * We bake the latest frame + this metadata into public/data/ so the client
 * overlays from our own origin (no CORS/hotlink fragility) and the overlay
 * stays aligned with the map.
 */

const MANIFEST_URL = 'https://www.ipma.pt/resources.www/transf/radar/imgs-radar.json';
const FRAME_BASE_URL = 'https://www.ipma.pt/resources.www/transf/radar/por/';

/** Official overlay bounds (SW → NE), from IPMA's own Leaflet map builder. */
const RADAR_BOUNDS = {
  south: 34.011513,
  west: -12.454795,
  north: 43.792862,
  east: -4.345465,
};

/**
 * Parse the manifest body → list of frames for the mainland mosaic.
 * Tolerates shape changes (returns [] on invalid input).
 * @param {unknown} raw parsed JSON
 * @returns {Array<{ date: string, path: string }>}
 */
function parseManifest(raw) {
  const list = raw && Array.isArray(raw.Portugal) ? raw.Portugal : [];
  const out = [];
  for (const entry of list) {
    if (!entry || typeof entry.path !== 'string' || !/\.png$/i.test(entry.path)) continue;
    out.push({
      date: typeof entry.date === 'string' ? entry.date : '',
      path: entry.path,
    });
  }
  return out;
}

/**
 * Newest frame = first valid entry (the manifest is newest-first).
 * @param {Array<{ date: string, path: string }>} frames
 * @returns {{ date: string, path: string } | null}
 */
function pickLatestFrame(frames) {
  return Array.isArray(frames) && frames.length > 0 ? frames[0] : null;
}

/**
 * Newest N frames for the carousel (manifest is newest-first, 5-min cadence).
 * @param {Array<{ date: string, path: string }>} frames
 * @param {number} [count] how many frames to keep (default 12 = last hour)
 * @returns {Array<{ date: string, path: string }>}
 */
function pickFrames(frames, count = 12) {
  if (!Array.isArray(frames)) return [];
  return frames.slice(0, Math.max(1, Math.floor(count)));
}

/**
 * "2026-08-14 18:35" → ISO UTC.
 * @param {string} dateStr
 * @returns {string | null}
 */
function frameIso(dateStr) {
  if (typeof dateStr !== 'string' || !dateStr.trim()) return null;
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Build the radar.json payload written to public/data/.
 *
 * Accepts the picked frame list (newest-first) so the client can animate the
 * last hour of 5-min frames as a carousel. The single "latest" fields are
 * kept for backward compatibility (same shape as before).
 *
 * @param {Array<{ date: string, path: string }>} frames newest-first
 * @param {number} nowMs
 * @returns {object}
 */
function buildRadarPayload(frames, nowMs = Date.now()) {
  const list = Array.isArray(frames) ? frames : [];
  const latest = list.length > 0 ? list[0] : null;
  return {
    source: 'ipma-radar',
    fetchedAt: new Date(nowMs).toISOString(),
    frameTime: latest ? frameIso(latest.date) : null,
    framePath: latest ? latest.path : null,
    imagePath: 'radar/ipma-radar.png',
    frames: list.map((frame) => ({
      frameTime: frameIso(frame.date),
      framePath: frame.path,
      imagePath: `radar/frames/${frame.path}`,
    })),
    bounds: RADAR_BOUNDS,
    attribution: 'IPMA',
  };
}

/**
 * Fetch the manifest.
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<Array<{ date: string, path: string }>>}
 */
async function fetchRadarManifest(fetchImpl = fetch) {
  const res = await fetchImpl(MANIFEST_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'VenTu-Bot/1.0 (+https://ventu.surf)' },
  });
  if (!res.ok) throw new Error(`IPMA radar manifest HTTP ${res.status}`);
  return parseManifest(await res.json());
}

module.exports = {
  MANIFEST_URL,
  FRAME_BASE_URL,
  RADAR_BOUNDS,
  parseManifest,
  pickLatestFrame,
  pickFrames,
  frameIso,
  buildRadarPayload,
  fetchRadarManifest,
};
