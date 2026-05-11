/**
 * Dawn Patrol AI Advisor
 * Generates morning surf advice for top spots using Gemini AI
 */

const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const RSS_FEEDS = [
  'https://surfertoday.com/rss',
  'https://www.windmag.com/rss',
];

const TOP_SPOTS = [
  { name: 'Supertubos', slug: 'supertubos', lat: 39.336, lon: -9.364, region: 'Peniche', type: 'surf' },
  { name: 'Guincho', slug: 'guincho', lat: 38.733, lon: -9.473, region: 'Cascais', type: 'surf' },
  { name: 'Nazaré', slug: 'nazare', lat: 39.597, lon: -9.073, region: 'Nazaré', type: 'big-wave' },
  { name: 'Ribeira d\'Ilhas', slug: 'ribeira-dilhas', lat: 39.489, lon: -9.364, region: 'Ericeira', type: 'surf' },
  { name: 'Coxos', slug: 'coxos', lat: 38.934, lon: -9.434, region: 'Ericeira', type: 'surf' },
  { name: 'Arrifana', slug: 'arrifana', lat: 37.294, lon: -8.864, region: 'Algarve', type: 'surf' },
  { name: 'Carcavelos', slug: 'carcavelos', lat: 38.679, lon: -9.335, region: 'Lisboa', type: 'surf' },
];

async function fetchMarineData(lat, lon, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height,wave_direction,wave_period,wind_speed_10m,wind_direction_10m,wind_gusts_10m,water_temperature&timezone=Europe/Lisbon&forecast_days=2&wind_speed_unit=ms`;
      const response = await fetch(url, { headers: { 'User-Agent': 'WindSpot-Bot/1.0' } });
      if (!response.ok) {
        if (attempt < retries) {
          console.log(`     Retry ${attempt + 1}/${retries} for ${lat},${lon}...`);
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        return null;
      }
      return await response.json();
    } catch (e) {
      if (attempt < retries) {
        console.log(`     Retry ${attempt + 1}/${retries} for ${lat},${lon}...`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      } else {
        console.error(`Failed to fetch marine data for ${lat},${lon}:`, e.message);
        return null;
      }
    }
  }
  return null;
}

function getMorningConditions(hourly) {
  const now = new Date();
  const morningHours = [6, 7, 8, 9, 10, 11];
  
  const morningData = morningHours.map(h => {
    const targetTime = new Date(now);
    targetTime.setHours(h, 0, 0, 0);
    if (targetTime < now) targetTime.setDate(targetTime.getDate() + 1);
    
    const isoTime = targetTime.toISOString().slice(0, 13) + ':00';
    const idx = hourly.time.findIndex(t => t.startsWith(isoTime.slice(0, 13)));
    
    if (idx === -1) return null;
    
    return {
      hour: h,
      waveHeight: hourly.wave_height[idx],
      wavePeriod: hourly.wave_period[idx],
      waveDirection: hourly.wave_direction[idx],
      windSpeed: hourly.wind_speed_10m[idx],
      windDirection: hourly.wind_direction_10m[idx],
      windGust: hourly.wind_gusts_10m[idx],
      waterTemp: hourly.water_temperature[idx],
    };
  }).filter(Boolean);
  
  return morningData;
}

function findBestWindow(conditions) {
  // Score each hour based on wave quality + wind
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
    const windKnots = c.windSpeed * 1.94384; // m/s to knots
    if (windKnots < 10) score += 25;
    else if (windKnots < 15) score += 18;
    else if (windKnots < 20) score += 10;
    else score += 5;
    
    return { ...c, score: Math.round(score) };
  });
  
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

async function generateDawnPatrolWithGemini(spotsData) {
  if (!GEMINI_API_KEY) {
    console.log('⚠️ No GEMINI_API_KEY found, using basic advice');
    return generateBasicAdvice(spotsData);
  }

  const prompt = `És um surf advisor experiente para Portugal. Analisa estas condições matinais e dá conselhos curtos e úteis em português (e inglês) para surfistas.

Dados:
${spotsData.map(s => `
${s.name} (${s.region}):
- Ondas: ${s.bestWindow.waveHeight.toFixed(1)}m @ ${s.bestWindow.wavePeriod.toFixed(0)}s
- Vento: ${(s.bestWindow.windSpeed * 1.94384).toFixed(0)} nós
- Água: ${s.bestWindow.waterTemp.toFixed(1)}°C
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
}`;

  try {
    const response = await fetch(`${GEMINI_API}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.4 },
      }),
    });

    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No JSON found in response');
  } catch (e) {
    console.error('Gemini error:', e.message);
    console.log('   Falling back to basic advice...');
    return generateBasicAdvice(spotsData);
  }
}

function generateBasicAdvice(spotsData) {
  // Fallback quando não há dados de nenhum spot
  if (!spotsData || spotsData.length === 0) {
    const date = new Date().toISOString().slice(0, 10);
    return {
      date,
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
  
  const date = new Date().toISOString().slice(0, 10);
  
  return {
    date,
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
    spots: spotsData.map(s => ({
      name: s.name,
      slug: s.slug,
      score: s.bestWindow.score,
      verdict: s.bestWindow.score >= 70 ? 'go' : s.bestWindow.score >= 50 ? 'maybe' : 'skip',
      ptReason: s.bestWindow.score >= 70 ? 'Condições excelentes' : s.bestWindow.score >= 50 ? 'Condições razoáveis' : 'Não vale a pena',
      enReason: s.bestWindow.score >= 70 ? 'Excellent conditions' : s.bestWindow.score >= 50 ? 'Fair conditions' : 'Not worth it',
    })),
  };
}

async function generateDawnPatrol() {
  console.log('🌅 Dawn Patrol AI Advisor - Generating...');
  console.log(`   Time: ${new Date().toLocaleString('pt-PT')}`);

  const spotsData = [];
  
  for (const spot of TOP_SPOTS) {
    console.log(`   Fetching ${spot.name}...`);
    const data = await fetchMarineData(spot.lat, spot.lon);
    if (!data?.hourly) continue;
    
    const morningConditions = getMorningConditions(data.hourly);
    const bestWindow = findBestWindow(morningConditions);
    
    spotsData.push({
      ...spot,
      bestWindow,
      allConditions: morningConditions,
    });
  }

  console.log(`   Analyzed ${spotsData.length} spots`);

  const advice = await generateDawnPatrolWithGemini(spotsData);

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
