/**
 * VenTu — Event Detection (Etapa 2)
 *
 * Reads conditions.json and detects cross-spot events using
 * deterministic thresholds. NO LLM involved.
 *
 * TODO v2: Add hourly forecast fetch from Open-Meteo to detect
 *           72h wave / 24h wind thresholds (currently uses snapshot).
 */

const path = require('path');
const fs = require('fs');

/**
 * Load conditions.json.
 */
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

/**
 * Convert m/s to knots.
 */
function msToKnots(ms) {
  return ms * 1.94384;
}

/**
 * Detect events from current conditions snapshot.
 * @param {object} conditions - { spotId: { waveHeight, windSpeed, waterTemp, ... } }
 * @returns {Array<{ id: string; title: string; titleEn: string; summary: string; summaryEn: string; category: string; source: string; sourceType: string; eventSeverity: string; url: string; publishedAt: string; tags: string[] }>}
 */
function detectEvents(conditions) {
  const events = [];
  const spots = Object.entries(conditions).filter(([, c]) => c);
  const now = new Date().toISOString();

  if (spots.length === 0) {
    console.log('  ℹ️ No conditions data — skipping event detection');
    return events;
  }

  console.log(`\n🌊  Etapa 2 — Detect events (${spots.length} spots)...`);

  // ─── Big swell ───
  const bigSwellSpots = spots.filter(([, c]) => (c.waveHeight || 0) > 3.0);
  if (bigSwellSpots.length > 0) {
    const names = bigSwellSpots.map(([id]) => id.replace(/-/g, ' ')).join(', ');
    const maxH = Math.max(...bigSwellSpots.map(([, c]) => c.waveHeight || 0));
    const isMassive = maxH > 4.0;
    events.push({
      id: `event-${Date.now()}-big-swell`,
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
      tags: ['ondas-grandes', 'big-wave', ...bigSwellSpots.map(([id]) => id)],
    });
    console.log(`  🌊 Big swell: ${bigSwellSpots.length} spots, max ${maxH.toFixed(1)}m`);
  }

  // ─── Strong wind ───
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
      id: `event-${Date.now()}-wind`,
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
      tags: ['vento-forte', 'strong-wind', ...strongWindSpots.map(([id]) => id)],
    });
    console.log(`  💨 Strong wind: ${strongWindSpots.length} spots, max ${maxKt.toFixed(0)}kt`);
  }

  // ─── Water temp anomaly ───
  const warmSpots = spots.filter(([, c]) => (c.waterTemp || 0) > 22);
  if (warmSpots.length > spots.length * 0.5) {
    const avgTemp = warmSpots.reduce((s, [, c]) => s + (c.waterTemp || 0), 0) / warmSpots.length;
    events.push({
      id: `event-${Date.now()}-warm-water`,
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
      tags: ['agua-quente', 'warm-water', 'verao'],
    });
    console.log(`  🌡️ Warm water: ${warmSpots.length} spots, avg ${avgTemp.toFixed(1)}°C`);
  }

  // ─── Stormy ───
  const stormSpots = spots.filter(([, c]) => msToKnots(c.windSpeed || 0) > 35);
  if (stormSpots.length >= 3) {
    const names = stormSpots.slice(0, 5).map(([id]) => id.replace(/-/g, ' ')).join(', ');
    events.push({
      id: `event-${Date.now()}-storm`,
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
      tags: ['tempestade', 'storm', 'safety', ...stormSpots.map(([id]) => id)],
    });
    console.log(`  ⛈️ Storm: ${stormSpots.length} spots above 35kt`);
  }

  if (events.length === 0) {
    console.log('  ℹ️ No events detected (conditions normal)');
  }

  return events;
}

module.exports = { detectEvents };
