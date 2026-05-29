/**
 * Dawn Patrol AI Advisor
 * Generates morning surf advice for top spots using LLM (Gemini → Groq → Cerebras fallback)
 * 
 * FIXED: Open-Meteo Marine API doesn't support water_temperature or wind variables.
 * Marine API only has wave + sea_surface_temperature.
 * Wind comes from the Forecast API.
 */

const fs = require('fs');
const path = require('path');
const { callLLM } = require('./llm-fallback');

const TOP_SPOTS = [
  { name: 'Supertubos', slug: 'supertubos', lat: 39.336, lon: -9.364, region: 'Peniche', type: 'surf' },
  { name: 'Guincho', slug: 'guincho', lat: 38.733, lon: -9.473, region: 'Cascais', type: 'surf' },
  { name: 'Nazaré', slug: 'nazare', lat: 39.597, lon: -9.073, region: 'Nazaré', type: 'big-wave' },
  { name: 'Ribeira d\'Ilhas', slug: 'ribeira-ilhas', lat: 39.489, lon: -9.364, region: 'Ericeira', type: 'surf' },
  { name: 'Coxos', slug: 'coxos', lat: 38.934, lon: -9.434, region: 'Ericeira', type: 'surf' },
  { name: 'Arrifana', slug: 'arrifana', lat: 37.294, lon: -8.864, region: 'Algarve', type: 'surf' },
  { name: 'Carcavelos', slug: 'carcavelos', lat: 38.679, lon: -9.335, region: 'Lisboa', type: 'surf' },
];

/** YYYY-MM-DD in Europe/Lisbon (matches Open-Meteo timezone=Europe/Lisbon). */
function lisbonDateStr(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(date);
}

function lisbonHour(date = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Lisbon',
      hour: 'numeric',
      hour12: false,
    }).format(date),
  );
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function fetchWithRetry(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'VenTu-Bot/1.0 (+https://ventu.surf)' } });
      if (!response.ok) {
        if (attempt < retries) {
          console.log(`     Retry ${attempt + 1}/${retries} for ${url.slice(0, 60)}...`);
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        console.error(`     Failed: HTTP ${response.status}`);
        return null;
      }
      return await response.json();
    } catch (e) {
      if (attempt < retries) {
        console.log(`     Retry ${attempt + 1}/${retries}...`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      } else {
        console.error(`     Failed: ${e.message}`);
        return null;
      }
    }
  }
  return null;
}

async function fetchSpotData(lat, lon) {
  // Marine API: waves + sea surface temperature
  // NOTE: water_temperature is NOT valid on marine-api. Use sea_surface_temperature.
  const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height,wave_direction,wave_period,sea_surface_temperature,sea_level_height_msl&timezone=Europe/Lisbon&forecast_days=2`;

  // Forecast API: wind (10m) — marine API does not have wind variables
  const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=Europe/Lisbon&forecast_days=2&wind_speed_unit=ms`;

  const [marine, forecast] = await Promise.all([
    fetchWithRetry(marineUrl),
    fetchWithRetry(forecastUrl),
  ]);

  if (!marine?.hourly || !forecast?.hourly) {
    console.log(`     Missing data: marine=${!!marine?.hourly}, forecast=${!!forecast?.hourly}`);
    return null;
  }

  // Merge both datasets by time index
  const time = marine.hourly.time;
  const hourly = {
    time,
    wave_height: marine.hourly.wave_height,
    wave_direction: marine.hourly.wave_direction,
    wave_period: marine.hourly.wave_period,
    sea_surface_temperature: marine.hourly.sea_surface_temperature,
    sea_level_height_msl: marine.hourly.sea_level_height_msl,
    wind_speed_10m: forecast.hourly.wind_speed_10m,
    wind_direction_10m: forecast.hourly.wind_direction_10m,
    wind_gusts_10m: forecast.hourly.wind_gusts_10m,
  };

  return hourly;
}

function getMorningConditions(hourly) {
  const now = new Date();
  const morningHours = [6, 7, 8, 9, 10, 11];
  const currentHour = lisbonHour(now);

  const morningData = morningHours.map(h => {
    // Past morning hours today → target same hour tomorrow (Lisbon local)
    let dateStr = lisbonDateStr(now);
    if (h <= currentHour) {
      dateStr = lisbonDateStr(addDays(now, 1));
    }

    const prefix = `${dateStr}T${String(h).padStart(2, '0')}`;
    const idx = hourly.time.findIndex(t => t.startsWith(prefix));

    if (idx === -1) return null;

    const seaLevel = hourly.sea_level_height_msl?.[idx] || 0;
    const seaLevelNext = hourly.sea_level_height_msl?.[idx + 1];
    const tideStatus = seaLevel > 0.3 ? 'high' : seaLevel < -0.3 ? 'low' : (seaLevelNext !== undefined && seaLevelNext > seaLevel) ? 'rising' : 'falling';

    return {
      hour: h,
      waveHeight: hourly.wave_height[idx],
      wavePeriod: hourly.wave_period[idx],
      waveDirection: hourly.wave_direction[idx],
      windSpeed: hourly.wind_speed_10m[idx],
      windDirection: hourly.wind_direction_10m[idx],
      windGust: hourly.wind_gusts_10m[idx],
      waterTemp: hourly.sea_surface_temperature[idx],
      tideHeight: seaLevel,
      tideStatus,
    };
  }).filter(Boolean);

  return morningData;
}

function findBestWindow(conditions) {
  const scored = conditions.map(c => {
    let score = 0;

    // Waves (0-50)
    if (c.waveHeight >= 1.0 && c.waveHeight <= 2.5) score += 30 + (c.waveHeight * 8);
    else if (c.waveHeight > 2.5) score += 40;
    else score += c.waveHeight * 20;

    // Period (0-20)
    if (c.wavePeriod >= 10) score += 20;
    else if (c.wavePeriod >= 8) score += 15;
    else score += c.wavePeriod * 1.5;

    // Wind - prefer offshore/light wind (0-30)
    const windKnots = c.windSpeed * 1.94384;
    if (windKnots < 10) score += 25;
    else if (windKnots < 15) score += 18;
    else if (windKnots < 20) score += 10;
    else score += 5;

    return { ...c, score: Math.round(score) };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

async function generateDawnPatrolWithLLM(spotsData) {
  if (!spotsData || spotsData.length === 0) {
    return generateBasicAdvice([]);
  }

  const prompt = `És um surf advisor experiente para Portugal. Analisa estas condições matinais e dá conselhos curtos e úteis em português (e inglês) para surfistas.

Dados:
${spotsData.map(s => `
${s.name} (${s.region}):
- Ondas: ${s.bestWindow.waveHeight.toFixed(1)}m @ ${s.bestWindow.wavePeriod.toFixed(0)}s
- Vento: ${(s.bestWindow.windSpeed * 1.94384).toFixed(0)} nós
- Água: ${s.bestWindow.waterTemp?.toFixed(1) ?? '--'}°C
- Score: ${s.bestWindow.score}/100
`).join('')}

Gera um JSON com esta estrutura EXACTA:
{
  "date": "YYYY-MM-DD",
  "topSpot": "Nome do melhor spot",
  "topSpotSlug": "slug-do-spot",
  "pt": {
    "headline": "Frase de impacto curta (max 80 chars)",
    "advice": "Conselho matinal detalhado (2-3 frases)",
    "bestTime": "HH:MM",
    "wetsuit": "Fato recomendado (ex: 3/2mm)",
    "crowdTip": "Dica sobre crowd"
  },
  "en": {
    "headline": "Short impactful phrase (max 80 chars)",
    "advice": "Detailed morning advice (2-3 sentences)",
    "bestTime": "HH:MM",
    "wetsuit": "Recommended wetsuit (e.g. 3/2mm)",
    "crowdTip": "Crowd tip"
  },
  "spots": [
    {
      "name": "Spot Name",
      "slug": "spot-slug",
      "score": 85,
      "verdict": "go" | "maybe" | "skip",
      "ptReason": "Porquê ir ou não",
      "enReason": "Why go or not"
    }
  ]
}

IMPORTANTE: Em "spots", usa APENAS estes slugs exactos (um por spot analisado):
${spotsData.map((s) => `- ${s.slug} (${s.name})`).join('\n')}`;

  try {
    console.log('   🤖 Calling LLM with fallback chain (Gemini → Groq → Cerebras)...');
    const result = await callLLM(prompt, { maxTokens: 2048, extractJson: true });

    if (typeof result === 'object' && result !== null) {
      return result;
    }

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    throw new Error('No JSON found in response');
  } catch (e) {
    console.error('LLM error:', e.message);
    console.log('   Falling back to basic advice...');
    return generateBasicAdvice(spotsData);
  }
}

function generateBasicAdvice(spotsData) {
  const date = lisbonDateStr();

  if (!spotsData || spotsData.length === 0) {
    return {
      date,
      generatedAt: new Date().toISOString(),
      topSpot: 'N/A',
      topSpotSlug: '',
      pt: {
        headline: 'Dados temporariamente indisponíveis 🌊',
        advice: 'Não foi possível obter dados das condições neste momento. Verifica as previsões mais tarde ou consulta a página individual de cada spot.',
        bestTime: '--:--',
        wetsuit: '3/2mm',
        crowdTip: 'Chega cedo para evitar crowd!',
      },
      en: {
        headline: 'Data temporarily unavailable 🌊',
        advice: 'Could not fetch conditions data right now. Check forecasts later or visit each spot\'s individual page.',
        bestTime: '--:--',
        wetsuit: '3/2mm',
        crowdTip: 'Get there early to beat the crowd!',
      },
      spots: [],
    };
  }

  const best = spotsData.sort((a, b) => b.bestWindow.score - a.bestWindow.score)[0];
  const windKnots = best.bestWindow.windSpeed * 1.94384;
  const waterTemp = best.bestWindow.waterTemp;

  const wetsuit = waterTemp > 18 ? '2mm shorty' : waterTemp > 15 ? '3/2mm' : waterTemp > 12 ? '4/3mm' : '5/4mm com capuz';
  const wetsuitEn = waterTemp > 18 ? '2mm shorty' : waterTemp > 15 ? '3/2mm' : waterTemp > 12 ? '4/3mm' : '5/4mm with hood';

  return {
    date,
    generatedAt: new Date().toISOString(),
    topSpot: best.name,
    topSpotSlug: best.slug,
    pt: {
      headline: `Hoje é dia de ${best.name}! 🌊`,
      advice: `Melhor janela: ${best.bestWindow.hour}:00h. Ondas de ${best.bestWindow.waveHeight.toFixed(1)}m com ${(windKnots).toFixed(0)} nós de vento.`,
      bestTime: `${best.bestWindow.hour}:00`,
      wetsuit,
      crowdTip: 'Chega cedo para evitar crowd!',
    },
    en: {
      headline: `Today is ${best.name} day! 🌊`,
      advice: `Best window: ${best.bestWindow.hour}:00. ${best.bestWindow.waveHeight.toFixed(1)}m waves with ${(windKnots).toFixed(0)} knot wind.`,
      bestTime: `${best.bestWindow.hour}:00`,
      wetsuit: wetsuitEn,
      crowdTip: 'Get there early to beat the crowd!',
    },
    spots: spotsFromMorningData(spotsData),
  };
}

function loadValidSlugs() {
  const spotsPath = path.join(__dirname, '../src/lib/spots.ts');
  const content = fs.readFileSync(spotsPath, 'utf8');
  return new Set([...content.matchAll(/slug: '([^']+)'/g)].map(m => m[1]));
}

function resolveValidSlug(slug, validSlugs) {
  if (!slug) return null;
  if (validSlugs.has(slug)) return slug;
  const first = slug.split('-')[0];
  if (validSlugs.has(first)) return first;
  for (const valid of validSlugs) {
    if (slug.startsWith(`${valid}-`) || slug.includes(valid)) return valid;
  }
  return null;
}

function spotsFromMorningData(spotsData) {
  return spotsData.map((s) => ({
    name: s.name,
    slug: s.slug,
    score: s.bestWindow.score,
    verdict: s.bestWindow.score >= 70 ? 'go' : s.bestWindow.score >= 50 ? 'maybe' : 'skip',
    ptReason: s.bestWindow.score >= 70 ? 'Condições excelentes' : s.bestWindow.score >= 50 ? 'Condições razoáveis' : 'Não vale a pena',
    enReason: s.bestWindow.score >= 70 ? 'Excellent conditions' : s.bestWindow.score >= 50 ? 'Fair conditions' : 'Not worth it',
  }));
}

function validateAdviceSlugs(advice, validSlugs, spotsData = []) {
  // Always use Lisbon calendar date — LLM may return stale or placeholder dates
  advice.date = lisbonDateStr();
  advice.generatedAt = new Date().toISOString();

  const resolvedTop = resolveValidSlug(advice.topSpotSlug, validSlugs);
  if (advice.topSpotSlug && !resolvedTop) {
    console.warn(`   ⚠️  Invalid topSpotSlug "${advice.topSpotSlug}" — clearing link`);
    advice.topSpotSlug = '';
  } else if (resolvedTop) {
    advice.topSpotSlug = resolvedTop;
  }

  if (Array.isArray(advice.spots)) {
    const before = advice.spots.length;
    advice.spots = advice.spots
      .map((s) => {
        const resolved = resolveValidSlug(s.slug, validSlugs);
        if (!resolved) {
          console.warn(`   ⚠️  Removing invalid spot slug "${s.slug || '(empty)'}"`);
          return null;
        }
        return { ...s, slug: resolved };
      })
      .filter(Boolean);
    if (advice.spots.length < before) {
      console.log(`   Slug validation: ${before - advice.spots.length} invalid entries removed`);
    }
  } else {
    advice.spots = [];
  }

  if (advice.spots.length === 0 && spotsData.length > 0) {
    console.log('   ⚠️  No valid verdict spots after LLM — using rule-based list');
    advice.spots = spotsFromMorningData(spotsData);
    if (!advice.topSpotSlug && advice.spots[0]) {
      advice.topSpotSlug = advice.spots[0].slug;
      advice.topSpot = advice.spots[0].name;
    }
  }

  return advice;
}

async function generateDawnPatrol() {
  console.log('🌅 Dawn Patrol AI Advisor - Generating...');
  console.log(`   Time: ${new Date().toLocaleString('pt-PT')}`);

  const validSlugs = loadValidSlugs();
  const spotsData = [];

  for (const spot of TOP_SPOTS) {
    console.log(`   Fetching ${spot.name}...`);
    const hourly = await fetchSpotData(spot.lat, spot.lon);
    if (!hourly) {
      console.log(`     ⚠️  Skipped ${spot.name} — no data`);
      continue;
    }

    const morningConditions = getMorningConditions(hourly);
    if (morningConditions.length === 0) {
      console.log(`     ⚠️  Skipped ${spot.name} — no morning conditions`);
      continue;
    }

    const bestWindow = findBestWindow(morningConditions);

    spotsData.push({
      ...spot,
      bestWindow,
      allConditions: morningConditions,
    });
  }

  console.log(`   Analyzed ${spotsData.length} spots`);

  let advice = await generateDawnPatrolWithLLM(spotsData);
  advice = validateAdviceSlugs(advice, validSlugs, spotsData);

  const outputPath = path.join(__dirname, '../public/data/dawn-patrol.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(advice, null, 2));

  console.log(`\n✅ Dawn Patrol saved to ${outputPath}`);
  console.log(`📍 Top spot: ${advice.topSpot}`);
  console.log(`⏰ Best time: ${advice.pt.bestTime}`);
  console.log(`🤙 ${advice.pt.headline}`);
}

generateDawnPatrol().catch(e => {
  console.error('❌ Fatal error in dawn-patrol:', e);
  process.exit(1);
});
