'use strict';
/**
 * storm-state por spot (B1 do docs/STORM-STUDY.md).
 *
 * Deriva o estado de precipitação de cada spot a partir dos frames PNG do
 * radar IPMA (1500×2331, bounds lineares SW 34.0115,-12.4548 → NE
 * 43.7929,-4.3455 — o mesmo rectângulo que o overlay Leaflet estica).
 *
 * Paleta do produto PCR IPMA (observada em frames reais):
 *  - alpha 0 → fora da cobertura do radar
 *  - opaco preto (r+g+b < ~24) → máscara de terra/costa, NÃO é eco
 *  - eco: azul/ciano (fraco) → verde (moderado) → amarelo/laranja/vermelho
 *    → magenta (forte)
 *
 * O vector de aproximação usa o centróide dos ecos numa caixa de ~150 km
 * à volta do spot, comparado entre o frame mais recente e o de ~15-20 min
 * antes: deslocamento do centróide na direcção do spot = «a aproximar-se».
 * Honesto por desenho — é movimento observado, nunca previsão.
 */

const KM_PER_DEG_LAT = 110.574;

// ─── Coordenadas ──────────────────────────────────────────────────────────

function latLonToPx(lat, lon, w, h, bounds) {
  const x = ((lon - bounds.west) / (bounds.east - bounds.west)) * w;
  const y = ((bounds.north - lat) / (bounds.north - bounds.south)) * h;
  return { x, y };
}

function pxToLatLon(x, y, w, h, bounds) {
  return {
    lat: bounds.north - (y / h) * (bounds.north - bounds.south),
    lon: bounds.west + (x / w) * (bounds.east - bounds.west),
  };
}

function kmPerPx(latDeg, w, h, bounds) {
  return {
    xKm: ((bounds.east - bounds.west) * 111.32 * Math.cos((latDeg * Math.PI) / 180)) / w,
    yKm: ((bounds.north - bounds.south) * KM_PER_DEG_LAT) / h,
  };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Bearing 0-360 de (lat1,lon1) → (lat2,lon2). */
function bearingDeg(lat1, lon1, lat2, lon2) {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// ─── Echo mask ────────────────────────────────────────────────────────────

const INTENSITY = { light: 1, moderate: 2, heavy: 3 };

/**
 * Percorre um frame RGBA e devolve os pixeis de eco.
 * @returns {{px: Array<{x:number,y:number,cls:number}>, total:number}}
 *   cls: 1 light | 2 moderate | 3 heavy
 */
function echoPixels(rgba, w, h) {
  const px = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = (y * w + x) * 4;
      const a = rgba[o + 3];
      if (a === 0) continue;
      const r = rgba[o];
      const g = rgba[o + 1];
      const b = rgba[o + 2];
      if (r + g + b < 24) continue; // máscara de terra (preto opaco)
      let cls = 1;
      if ((r >= 160 && g >= 96) || (r >= 120 && b >= 120 && g < r)) cls = 3;
      else if (g >= r && g >= b && g >= 120) cls = 2;
      px.push({ x, y, cls });
    }
  }
  return { px, total: w * h };
}

// ─── Análise por spot ─────────────────────────────────────────────────────

const STATE_OVER_KM = 8;
const STATE_NEAR_KM = 40;
const NEAREST_WINDOW_KM = 60;
const CENTROID_BOX_KM = 150;

/**
 * Estado do eco para um spot num frame.
 * @param {{lat:number,lon:number}} spot
 * @param {{x:number,y:number,cls:number}[]} echoList
 * @param {{w:number,h:number,bounds:object}} frame
 */
function spotEcho(spot, echoList, frame) {
  const { w, h, bounds } = frame;
  if (spot.lat < bounds.south || spot.lat > bounds.north || spot.lon < bounds.west || spot.lon > bounds.east) {
    return null; // fora das bounds (Madeira/Açores) — honesto, sem estado
  }
  const p = latLonToPx(spot.lat, spot.lon, w, h, bounds);
  const kpp = kmPerPx(spot.lat, w, h, bounds);
  const rWin = NEAREST_WINDOW_KM / Math.min(kpp.xKm, kpp.yKm);
  const rBox = CENTROID_BOX_KM / Math.min(kpp.xKm, kpp.yKm);

  let nearestPx = Infinity;
  let maxCls = 0;
  let echoCount = 0;
  let cx = 0;
  let cy = 0;
  let nBox = 0;

  for (const e of echoList) {
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const dPxSq = dx * dx + dy * dy;
    if (dPxSq <= rWin * rWin) {
      const dPx = Math.sqrt(dPxSq);
      if (dPx < nearestPx) nearestPx = dPx;
      if (e.cls > maxCls) maxCls = e.cls;
      echoCount += 1;
    }
    if (dPxSq <= rBox * rBox) {
      cx += e.x;
      cy += e.y;
      nBox += 1;
    }
  }

  const distKm = nearestPx === Infinity ? null : Math.round(nearestPx * Math.min(kpp.xKm, kpp.yKm));
  const centroid = nBox > 0 ? { x: cx / nBox, y: cy / nBox } : null;
  let dirDeg = null;
  if (centroid) {
    const c = pxToLatLon(centroid.x, centroid.y, w, h, bounds);
    dirDeg = Math.round(bearingDeg(spot.lat, spot.lon, c.lat, c.lon));
  }

  const state = distKm == null ? 'clean' : distKm <= STATE_OVER_KM ? 'over' : distKm <= STATE_NEAR_KM ? 'near' : 'clean';
  return {
    state,
    distKm,
    dirDeg,
    intensity: maxCls === 3 ? 'heavy' : maxCls === 2 ? 'moderate' : maxCls === 1 ? 'light' : null,
    centroidPx: centroid,
    echoCount,
  };
}

/**
 * Vector de deslocamento do centróide entre dois frames.
 * @returns {{deg:number, kmh:number, toward:boolean}|null}
 */
function approachVector(centroidOldPx, centroidNewPx, dtMs, spot, frame) {
  if (!centroidOldPx || !centroidNewPx || dtMs <= 0) return null;
  const kpp = kmPerPx(spot.lat, frame.w, frame.h, frame.bounds);
  const dxKm = (centroidNewPx.x - centroidOldPx.x) * kpp.xKm;
  const dyKm = (centroidOldPx.y - centroidNewPx.y) * kpp.yKm; // y cresce para sul
  const distKm = Math.hypot(dxKm, dyKm);
  if (distKm < 2) return null; // ruído/estacionário — não inventa vector
  const hours = dtMs / 3600000;
  const kmh = Math.round(distKm / hours);
  const deg = Math.round(((Math.atan2(dxKm, dyKm) * 180) / Math.PI + 360) % 360);
  // O deslocamento aponta para o spot? (dot > 0)
  const p = latLonToPx(spot.lat, spot.lon, frame.w, frame.h, frame.bounds);
  const toSpotX = p.x - centroidOldPx.x;
  const toSpotY = centroidOldPx.y - p.y; // inverter eixo y
  const vx = centroidNewPx.x - centroidOldPx.x;
  const vy = -(centroidNewPx.y - centroidOldPx.y);
  const toward = vx * toSpotX + vy * toSpotY > 0;
  return { deg, kmh, toward };
}

/**
 * Estado de radar composto para um spot a partir de dois frames.
 * @param echoNow/echoOld saídas de spotEcho (mesmo spot, frames diferentes)
 */
function classifySpot(spot, echoNow, echoOld, dtMs, frame) {
  if (echoNow === null) return null;
  const out = { ...echoNow, centroidPx: undefined, approach: null };
  delete out.echoCount;
  if (!echoOld) {
    return out;
  }
  const v = approachVector(echoOld.centroidPx, echoNow.centroidPx, dtMs, spot, frame);
  if (v) {
    out.approach = { state: v.toward ? 'approaching' : 'receding', deg: v.deg, kmh: v.kmh };
  } else if (
    echoOld.distKm != null &&
    echoNow.distKm != null &&
    Math.abs(echoNow.distKm - echoOld.distKm) >= 8
  ) {
    // Fallback sem centróide fiável: distância do eco mais próximo encolheu.
    out.approach = {
      state: echoNow.distKm < echoOld.distKm ? 'approaching' : 'receding',
      deg: null,
      kmh: null,
    };
  }
  return out;
}

// ─── Payload ──────────────────────────────────────────────────────────────

const WARN_RANK = { yellow: 1, orange: 2, red: 3 };

function maxWarnLevel(warnings) {
  let best = null;
  for (const w of warnings || []) {
    const lv = String(w.level || '').toLowerCase();
    if ((WARN_RANK[lv] || 0) > (WARN_RANK[best] || 0)) best = lv;
  }
  return best;
}

/**
 * @param {Array<{frameTime:string, echoList:Array, w:number, h:number, bounds:object}>} framesAnalysed
 *   newest-first (índice 0 = mais recente); o último é o frame de comparação.
 * @param {Array<{id:string,lat:number,lon:number}>} spots
 * @param {object|null} warningsJson warnings.json (spotWarnings por spotId)
 * @param {object|null} stormsJson storms.json (spotStorms por spotId)
 * @param {string} fetchedAt ISO
 */
function buildStormState(framesAnalysed, spots, warningsJson, stormsJson, fetchedAt) {
  const newest = framesAnalysed[0];
  const older = framesAnalysed.length > 1 ? framesAnalysed[framesAnalysed.length - 1] : null;
  const dtMs = older ? Date.parse(newest.frameTime) - Date.parse(older.frameTime) : 0;
  const spotWarnings = warningsJson?.spotWarnings || {};
  const spotStorms = stormsJson?.spotStorms || {};

  const out = {};
  for (const sp of spots || []) {
    const echoNow = spotEcho(sp, newest.echoList, newest);
    const echoOld = older ? spotEcho(sp, older.echoList, older) : null;
    const radar = classifySpot(sp, echoNow, echoOld, dtMs, newest);
    const warnLevel = maxWarnLevel(spotWarnings[sp.id]);
    const inStormCone = Array.isArray(spotStorms[sp.id]) && spotStorms[sp.id].length > 0;
    out[sp.id] = { radar, warnLevel, inStormCone };
  }

  return {
    source: 'ventu-storm-state',
    fetchedAt,
    radar: {
      frameTime: newest.frameTime,
      compareFrameTime: older?.frameTime ?? null,
      bounds: newest.bounds,
    },
    spots: out,
  };
}

module.exports = {
  KM_PER_DEG_LAT,
  STATE_OVER_KM,
  STATE_NEAR_KM,
  NEAREST_WINDOW_KM,
  CENTROID_BOX_KM,
  INTENSITY,
  latLonToPx,
  pxToLatLon,
  kmPerPx,
  haversineKm,
  bearingDeg,
  echoPixels,
  spotEcho,
  approachVector,
  classifySpot,
  maxWarnLevel,
  buildStormState,
};
