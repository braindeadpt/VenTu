'use strict';

/**
 * HFR-Lisboa — correntes de superfície MEDIDAS por radar HF (IH), via
 * EMODnet Physics ERDDAP `HFRADAR_LISBOA_Totals` (griddap, sem chave).
 *
 * O dataset é uma grelha horária EWCT/NSCT (componentes u/v em m s⁻¹,
 * convenção oceânica: u positivo→Este, v positivo→Norte; a direcção
 * resultante é «para onde» a corrente vai). Cobre ~Sines→Peniche
 * (lat 37.90–38.90, lon −10.60→−8.70) a ~1.4 km, actualizado de hora a
 * hora. Células fora da máscara de radar vêm vazias; QCflag quando
 * presente filtra leituras duvidosas.
 */

/** Frescura máxima do ficheiro antes de o merge omitir as correntes.
 *  6 h como o gate das marés IH — a rede atrasa às vezes e uma corrente
 *  de há 5 h ainda diz mais que o silêncio (timestamp vai na UI). */
const MAX_AGE_HOURS = 6;
/** Distância máxima spot→célula válida para adoptar a leitura (km). */
const MAX_DIST_KM = 15;
/** |u|,|v| plausíveis (m/s) — acima disto é lixo de radar. */
const MAX_COMPONENT_MS = 3;

const KM_PER_DEG_LAT = 111.32;

const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Parse do CSV griddap (time,depth,latitude,longitude,EWCT,NSCT[,QCflag]).
 * Devolve { time, cells: [{lat, lon, u, v, qc}] } com só células válidas.
 */
function parseGridCsv(csv) {
  if (typeof csv !== 'string' || csv.length < 20) {
    throw new Error('empty HFR csv');
  }
  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);
  // Linha 1 = nomes, linha 2 = unidades; dados a partir da linha 3.
  if (lines.length < 4 || !/^time/i.test(lines[0])) {
    throw new Error(`unexpected HFR csv shape (${lines.length} lines)`);
  }
  const header = lines[0].split(',').map((s) => s.trim());
  const col = (name) => header.indexOf(name);
  const iTime = col('time');
  const iLat = col('latitude');
  const iLon = col('longitude');
  const iU = col('EWCT');
  const iV = col('NSCT');
  const iQc = col('QCflag');
  if ([iTime, iLat, iLon, iU, iV].some((i) => i < 0)) {
    throw new Error('HFR csv missing expected columns');
  }
  let time = null;
  const cells = [];
  for (let i = 2; i < lines.length; i += 1) {
    const parts = lines[i].split(',');
    // Number('') === 0 — uma célula vazia (fora da máscara) não pode virar
    // componente 0, isso fabricaria um vector de corrente falso.
    const num = (idx) => {
      const s = (parts[idx] ?? '').trim();
      return s === '' ? NaN : Number(s);
    };
    const u = num(iU);
    const v = num(iV);
    const lat = num(iLat);
    const lon = num(iLon);
    if (iTime >= 0 && parts[iTime] && !time) time = parts[iTime];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    // null/vazio → célula fora da máscara; QCflag>1 → leitura duvidosa.
    if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
    if (Math.abs(u) > MAX_COMPONENT_MS || Math.abs(v) > MAX_COMPONENT_MS) continue;
    const qc = iQc >= 0 ? Number(parts[iQc]) : 1;
    if (iQc >= 0 && Number.isFinite(qc) && qc > 1) continue;
    cells.push({ lat, lon, u: round3(u), v: round3(v) });
  }
  if (!cells.length) throw new Error('HFR csv: 0 valid cells');
  return { time, cells };
}

/** Distância aproximada em km (equirectangular — suficiente a <20 km). */
function distKm(lat1, lon1, lat2, lon2) {
  const dy = (lat2 - lat1) * KM_PER_DEG_LAT;
  const dx = (lon2 - lon1) * KM_PER_DEG_LAT * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Célula válida mais próxima do ponto, dentro de maxKm — a máscara do
 * radar tem buracos (shadow zones), por isso «mais próxima válida» e não
 * «célula exacta». null quando o ponto está fora da cobertura.
 */
function nearestCell(cells, lat, lon, maxKm = MAX_DIST_KM) {
  let best = null;
  let bestKm = maxKm;
  for (const c of cells) {
    const km = distKm(lat, lon, c.lat, c.lon);
    if (km < bestKm) {
      bestKm = km;
      best = c;
    }
  }
  return best ? { ...best, distKm: round2(bestKm) } : null;
}

/**
 * Componentes (u→Este, v→Norte) → {spd, dir}: direcção «para onde» a
 * corrente vai, em graus (convenção oceânica, N=0, E=90).
 */
function currentFromUV(u, v) {
  const spd = Math.sqrt(u * u + v * v);
  const dir = (Math.atan2(u, v) * 180) / Math.PI;
  return { spd: round3(spd), dir: Math.round(((dir % 360) + 360) % 360) };
}

/** Idade do timestamp da grelha em horas — gate de frescura do merge. */
function gridAgeHours(timeIso, nowMs = Date.now()) {
  const t = new Date(timeIso).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (nowMs - t) / 3_600_000;
}

module.exports = {
  MAX_AGE_HOURS,
  MAX_DIST_KM,
  MAX_COMPONENT_MS,
  parseGridCsv,
  distKm,
  nearestCell,
  currentFromUV,
  gridAgeHours,
};
