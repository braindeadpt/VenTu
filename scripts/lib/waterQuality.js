'use strict';
/**
 * APA / InfoÁgua bathing-water quality.
 *
 * infoagua.apambiente.pt embeds the full bathing-water dataset inline in the
 * homepage HTML as literal JS arrays (DATA_BeachesData, DATA_BeachesAlerts,
 * DATA_BeachQualityMap). One GET, no auth, pt+en alert strings included.
 *
 * `quality.ultima_classificacao` is the live bathing advice:
 *   0 = ainda não há análises, 1 = adequada para banhos, 2 = desaconselhada.
 * `quality.classificacao_ano_anterior` is the official annual class
 *   (1 Excelente, 2 Boa, 3 Aceitável, 4 Má, 0 sem classificação,
 *    5 identificada nesta época).
 */
const { extractJsVar } = require('./apaExtract');

const KM_PER_DEG = 111.32;
const MAX_BEACH_KM = 3;

function stripHtml(s) {
  return typeof s === 'string' ? s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : null;
}

function parseApaHomepage(html) {
  if (typeof html !== 'string' || !html.includes('DATA_BeachesData')) return null;
  const beaches = JSON.parse(extractJsVar(html, 'DATA_BeachesData'));
  const alerts = extractJsVar(html, 'DATA_BeachesAlerts');
  const qualityMap = extractJsVar(html, 'DATA_BeachQualityMap');
  return {
    beaches,
    alerts: alerts ? JSON.parse(alerts) : [],
    qualityMap: qualityMap ? JSON.parse(qualityMap) : [],
  };
}

function distKm(lat1, lon1, lat2, lon2) {
  return Math.hypot(
    (lat2 - lat1) * KM_PER_DEG,
    (lon2 - lon1) * KM_PER_DEG * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180)
  );
}

/** Normalize one embedded beach entry into the artifact record. */
function normalizeBeach(b) {
  const q = b?.quality;
  const p = b?.profile;
  if (!q || !Number.isFinite(q.latitude_wgs84) || !Number.isFinite(q.longitude_wgs84)) return null;
  const title = q.ultima_classificacao_titulo;
  return {
    beachId: b.id,
    beach: q.nome_agua_balnear ?? p?.praia ?? null,
    lat: q.latitude_wgs84,
    lon: q.longitude_wgs84,
    advice: [0, 1, 2].includes(q.ultima_classificacao) ? q.ultima_classificacao : 0,
    adviceTitlePt: stripHtml(title?.pt?.name),
    adviceTitleEn: stripHtml(title?.en?.name),
    adviceAt: q.data_ultima_classificacao ?? null,
    motive: stripHtml(q.motivo_desc),
    lastSampleAt: q.data_ultima_analise ?? null,
    annualClass: Number.isInteger(q.classificacao_ano_anterior) ? q.classificacao_ano_anterior : 0,
    annualClassDesc: stripHtml(q.classificacao_ano_anterior_dsc),
    seasonStart: Number.isFinite(q.data_inicio_epoca_balnear) ? q.data_inicio_epoca_balnear : null,
    seasonEnd: Number.isFinite(q.data_fim_epoca_balnear) ? q.data_fim_epoca_balnear : null,
    blueFlag: p?.bandeira_azul === 1 || p?.bandeira_azul === true,
    guarded: p?.vigilancia === 1 || p?.vigilancia === true,
    accessible: p?.acessivel === 1 || p?.acessivel === true,
  };
}

/** Normalize one embedded alert (fields are nested per lang: {pt:{...}, en:{...}}). */
function normalizeAlert(a) {
  const pt = a?.pt ?? a;
  const en = a?.en ?? {};
  if (!pt?.beach_id || !pt?.name) return null;
  return {
    beachId: pt.beach_id,
    namePt: stripHtml(pt.name),
    nameEn: stripHtml(en.name) ?? stripHtml(pt.name),
    advicePt: stripHtml(pt.advices),
    adviceEn: stripHtml(en.advices) ?? stripHtml(pt.advices),
    date: pt.beach_update ?? null,
  };
}

/** Época balnear check — evaluated at render/merge time, not fetch time. */
function inSeason(beach, nowMs) {
  if (!beach?.seasonStart || !beach?.seasonEnd) return false;
  return nowMs >= beach.seasonStart && nowMs <= beach.seasonEnd;
}

function nearestBeach(lat, lon, beaches, maxKm = MAX_BEACH_KM) {
  let best = null;
  for (const b of beaches) {
    const d = distKm(lat, lon, b.lat, b.lon);
    if (d <= maxKm && (!best || d < best.distKm)) best = { beach: b, distKm: d };
  }
  return best;
}

/**
 * Build the water-quality artifact:
 * { generatedAt, source, spots: { [spotId]: {...} } }
 */
function buildWaterQualityArtifact(html, spots, nowIso) {
  const parsed = parseApaHomepage(html);
  if (!parsed) return null;
  const beaches = parsed.beaches.map(normalizeBeach).filter(Boolean);
  const alerts = parsed.alerts.map(normalizeAlert).filter(Boolean);
  const alertsByBeach = new Map();
  for (const a of alerts) {
    if (!alertsByBeach.has(a.beachId)) alertsByBeach.set(a.beachId, []);
    alertsByBeach.get(a.beachId).push({
      namePt: a.namePt, nameEn: a.nameEn,
      advicePt: a.advicePt, adviceEn: a.adviceEn, date: a.date,
    });
  }
  const out = {};
  for (const sp of spots) {
    const hit = nearestBeach(sp.lat, sp.lon, beaches);
    if (!hit) continue;
    const { beach, distKm: d } = hit;
    const rec = { ...beach, distKm: Math.round(d * 10) / 10 };
    delete rec.lat; delete rec.lon;
    const beachAlerts = alertsByBeach.get(beach.beachId);
    if (beachAlerts?.length) rec.alerts = beachAlerts;
    out[sp.id] = rec;
  }
  return {
    generatedAt: nowIso,
    source: 'infoagua.apambiente.pt',
    beaches: beaches.length,
    activeAlerts: alerts.length,
    spots: out,
  };
}

module.exports = {
  parseApaHomepage,
  normalizeBeach,
  normalizeAlert,
  inSeason,
  nearestBeach,
  distKm,
  buildWaterQualityArtifact,
  stripHtml,
  MAX_BEACH_KM,
};
