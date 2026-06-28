/**
 * VenTu — Event Detection (Etapa 2)
 *
 * Snapshot from conditions.json + forecast windows from forecasts.json.
 * NO LLM involved.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let idCounter = 0;
function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${(idCounter++).toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function loadConditions() {
  try {
    const fp = path.join(__dirname, '../../public/data/conditions.json');
    if (!fs.existsSync(fp)) return {};
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch (e) {
    console.warn('  ⚠️ Failed to load conditions:', e.message);
    return {};
  }
}

function loadForecasts() {
  try {
    const fp = path.join(__dirname, '../../public/data/forecasts.json');
    if (!fs.existsSync(fp)) return {};
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch (e) {
    console.warn('  ⚠️ Failed to load forecasts:', e.message);
    return {};
  }
}

function msToKnots(ms) {
  return ms * 1.94384;
}

function waveHeightAt(h) {
  return Math.max(h.waveHeight || 0, h.swellHeight || 0);
}

/**
 * Current conditions snapshot (existing behaviour).
 */
function detectSnapshotEvents(conditions) {
  const events = [];
  const spots = Object.entries(conditions).filter(([, c]) => c);
  const now = new Date().toISOString();

  if (spots.length === 0) return events;

  const bigSwellSpots = spots.filter(([, c]) => (c.waveHeight || 0) > 3.0);
  if (bigSwellSpots.length > 0) {
    const names = bigSwellSpots.map(([id]) => id.replace(/-/g, ' ')).join(', ');
    const maxH = Math.max(...bigSwellSpots.map(([, c]) => c.waveHeight || 0));
    const isMassive = maxH > 4.0;
    events.push({
      id: uniqueId('event-snapshot-big-swell'),
      title: `Ondas grandes detectadas: ${maxH.toFixed(1)}m em ${bigSwellSpots.length} spot${bigSwellSpots.length > 1 ? 's' : ''}`,
      titleEn: `Big swell detected: ${maxH.toFixed(1)}m at ${bigSwellSpots.length} spot${bigSwellSpots.length > 1 ? 's' : ''}`,
      summary: `Ondas acima de 3m em ${names}. ${isMassive ? 'Condições extremas — apenas para especialistas.' : 'Prepara-te para um dia de ondas grandes.'}`,
      summaryEn: `Waves over 3m at ${names}. ${isMassive ? 'Extreme conditions — experts only.' : 'Get ready for a big wave day.'}`,
      category: isMassive ? 'big-wave' : 'surf',
      source: 'VenTu Data',
      sourceType: 'data',
      eventSeverity: isMassive ? 'warning' : 'info',
      url: 'https://ventu.surf',
      publishedAt: now,
      tags: ['ondas-grandes', 'big-wave', 'agora', ...bigSwellSpots.map(([id]) => id)],
    });
  }

  const strongWindSpots = spots.filter(([, c]) => msToKnots(c.windSpeed || 0) > 25);
  if (strongWindSpots.length > 0) {
    const maxKt = Math.max(...strongWindSpots.map(([, c]) => msToKnots(c.windSpeed || 0)));
    const names = strongWindSpots.map(([id]) => id.replace(/-/g, ' ')).join(', ');
    const isStorm = maxKt > 40;
    let category = 'kitesurf';
    if (maxKt > 40) category = 'alert';
    else if (maxKt > 30) category = 'windsurf';
    const severity = isStorm ? 'alert' : maxKt > 35 ? 'warning' : 'info';
    events.push({
      id: uniqueId('event-snapshot-wind'),
      title: `Vento forte: ${maxKt.toFixed(0)}kt em ${strongWindSpots.length} spot${strongWindSpots.length > 1 ? 's' : ''}`,
      titleEn: `Strong wind: ${maxKt.toFixed(0)}kt at ${strongWindSpots.length} spot${strongWindSpots.length > 1 ? 's' : ''}`,
      summary: `Rajadas acima de ${maxKt.toFixed(0)}kt detectadas em ${names}. ${isStorm ? 'Perigo — vento extremo, evita a água.' : 'Condições ideais para kitesurf/windsurf com experiência.'}`,
      summaryEn: `Gusts over ${maxKt.toFixed(0)}kt detected at ${names}. ${isStorm ? 'Danger — extreme wind, stay out of the water.' : 'Ideal conditions for experienced kitesurf/windsurf.'}`,
      category,
      source: 'VenTu Data',
      sourceType: 'data',
      eventSeverity: severity,
      url: 'https://ventu.surf',
      publishedAt: now,
      tags: ['vento-forte', 'strong-wind', 'agora', ...strongWindSpots.map(([id]) => id)],
    });
  }

  const warmSpots = spots.filter(([, c]) => (c.waterTemp || 0) > 22);
  if (warmSpots.length > spots.length * 0.5) {
    const avgTemp = warmSpots.reduce((s, [, c]) => s + (c.waterTemp || 0), 0) / warmSpots.length;
    events.push({
      id: uniqueId('event-snapshot-warm-water'),
      title: `Água quente: média ${avgTemp.toFixed(1)}°C na maioria dos spots`,
      titleEn: `Warm water: avg ${avgTemp.toFixed(1)}°C across most spots`,
      summary: `Temperatura da água acima de 22°C em ${warmSpots.length} spots. Dias de praia perfeitos!`,
      summaryEn: `Water temperature above 22°C at ${warmSpots.length} spots. Perfect beach days!`,
      category: 'general',
      source: 'VenTu Data',
      sourceType: 'data',
      eventSeverity: 'info',
      url: 'https://ventu.surf',
      publishedAt: now,
      tags: ['agua-quente', 'warm-water', 'verao', 'agora'],
    });
  }

  // Only emit a separate storm event when it wasn't already covered by the
  // strong-wind event above (which fires at >25kt and already flags >40kt as
  // 'alert').  This avoids duplicate near-identical items in the feed.
  const alreadyHasWindAlert = events.some((e) => e.tags?.includes('vento-forte'));
  const stormSpots = spots.filter(([, c]) => msToKnots(c.windSpeed || 0) > 35);
  if (stormSpots.length >= 3 && !alreadyHasWindAlert) {
    const names = stormSpots.slice(0, 5).map(([id]) => id.replace(/-/g, ' ')).join(', ');
    events.push({
      id: uniqueId('event-snapshot-storm'),
      title: `Tempestade: vento >35kt em ${stormSpots.length} spots`,
      titleEn: `Storm: wind >35kt at ${stormSpots.length} spots`,
      summary: `Condições de tempestade detectadas em vários spots: ${names}. Recomenda-se não ir para a água.`,
      summaryEn: `Storm conditions detected across multiple spots: ${names}. Stay out of the water.`,
      category: 'safety',
      source: 'VenTu Data',
      sourceType: 'data',
      eventSeverity: 'alert',
      url: 'https://ventu.surf',
      publishedAt: now,
      tags: ['tempestade', 'storm', 'safety', 'agora', ...stormSpots.map(([id]) => id)],
    });
  }

  return events;
}

/**
 * Scan forecasts.json hourly arrays for upcoming 72h swell / 24h wind windows.
 */
function detectForecastEvents(forecasts) {
  const events = [];
  if (!forecasts || typeof forecasts !== 'object') return events;

  const nowMs = Date.now();
  const ms72 = nowMs + 72 * 60 * 60 * 1000;
  const ms24 = nowMs + 24 * 60 * 60 * 1000;
  const publishedAt = new Date().toISOString();

  let maxWave72 = 0;
  const waveSpotIds = [];
  let maxWind24 = 0;
  const windSpotIds = [];

  for (const [spotId, entry] of Object.entries(forecasts)) {
    const hourly = entry?.hourly;
    if (!Array.isArray(hourly)) continue;

    let spotMaxWave = 0;
    let spotMaxWind = 0;

    for (const h of hourly) {
      const t = new Date(h.time).getTime();
      if (Number.isNaN(t) || t < nowMs) continue;

      if (t <= ms72) {
        const wh = waveHeightAt(h);
        if (wh > spotMaxWave) spotMaxWave = wh;
        if (wh > maxWave72) maxWave72 = wh;
      }
      if (t <= ms24) {
        const kt = msToKnots(h.windSpeed || 0);
        if (kt > spotMaxWind) spotMaxWind = kt;
        if (kt > maxWind24) maxWind24 = kt;
      }
    }

    if (spotMaxWave >= 3) waveSpotIds.push(spotId);
    if (spotMaxWind >= 25) windSpotIds.push(spotId);
  }

  if (maxWave72 >= 3 && waveSpotIds.length >= 2) {
    const isMassive = maxWave72 > 4;
    const sample = waveSpotIds.slice(0, 5).map((id) => id.replace(/-/g, ' ')).join(', ');
    events.push({
      id: uniqueId('event-forecast-swell-72h'),
      title: `Previsão 72h: ondas até ${maxWave72.toFixed(1)}m em ${waveSpotIds.length} spots`,
      titleEn: `72h forecast: waves up to ${maxWave72.toFixed(1)}m at ${waveSpotIds.length} spots`,
      summary: `Nas próximas 72 horas, ondas ≥3m previstas em ${sample}${waveSpotIds.length > 5 ? '…' : ''}. ${isMassive ? 'Atenção redobrada em spots expostos.' : 'Bom para planear sessão.'}`,
      summaryEn: `In the next 72 hours, waves ≥3m forecast at ${sample}${waveSpotIds.length > 5 ? '…' : ''}. ${isMassive ? 'Extra caution on exposed breaks.' : 'Good for session planning.'}`,
      category: isMassive ? 'big-wave' : 'surf',
      source: 'VenTu Forecast',
      sourceType: 'data',
      eventSeverity: isMassive ? 'warning' : 'info',
      url: 'https://ventu.surf',
      publishedAt,
      tags: ['previsao', 'forecast-72h', 'ondas-grandes', ...waveSpotIds.slice(0, 8)],
    });
  }

  if (maxWind24 >= 25 && windSpotIds.length >= 2) {
    const isStorm = maxWind24 > 35;
    const sample = windSpotIds.slice(0, 5).map((id) => id.replace(/-/g, ' ')).join(', ');
    let category = 'kitesurf';
    if (maxWind24 > 40) category = 'alert';
    else if (maxWind24 > 30) category = 'windsurf';

    events.push({
      id: uniqueId('event-forecast-wind-24h'),
      title: `Previsão 24h: vento até ${maxWind24.toFixed(0)}kt em ${windSpotIds.length} spots`,
      titleEn: `24h forecast: wind up to ${maxWind24.toFixed(0)}kt at ${windSpotIds.length} spots`,
      summary: `Nas próximas 24 horas, vento forte previsto em ${sample}${windSpotIds.length > 5 ? '…' : ''}. ${isStorm ? 'Evita água em spots expostos.' : 'Janela para kite/wind com experiência.'}`,
      summaryEn: `In the next 24 hours, strong wind forecast at ${sample}${windSpotIds.length > 5 ? '…' : ''}. ${isStorm ? 'Avoid exposed water.' : 'Window for experienced kite/wind.'}`,
      category,
      source: 'VenTu Forecast',
      sourceType: 'data',
      eventSeverity: isStorm ? 'alert' : maxWind24 > 30 ? 'warning' : 'info',
      url: 'https://ventu.surf',
      publishedAt,
      tags: ['previsao', 'forecast-24h', 'vento-forte', ...windSpotIds.slice(0, 8)],
    });
  }

  return events;
}

function detectEvents(conditions) {
  if (!conditions) conditions = loadConditions();
  const forecasts = loadForecasts();

  console.log(`\n🌊  Etapa 2 — Detect events...`);

  const snapshot = detectSnapshotEvents(conditions);
  const forecast = detectForecastEvents(forecasts);
  const events = [...snapshot, ...forecast].map((e) => ({
    ...e,
    sourceRegion: 'pt',
    tags: [...new Set([...(e.tags || []), 'cena-pt', 'portugal'])],
  }));

  if (snapshot.length) console.log(`  📍 Snapshot events: ${snapshot.length}`);
  if (forecast.length) console.log(`  📅 Forecast events: ${forecast.length}`);
  if (events.length === 0) console.log('  ℹ️ No events detected');

  return events;
}

module.exports = {
  detectEvents,
  detectSnapshotEvents,
  detectForecastEvents,
  loadConditions,
  loadForecasts,
  msToKnots,
  waveHeightAt,
};
