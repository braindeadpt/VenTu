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
const { attachMoonTideLines } = require('./lib/attachMoonTide');
const { morningScore, resolveMorningRecalibration } = require('./lib/dawnPatrolScore');
const { coastalWarningsForSpot, coastalWarningLine } = require('./lib/ihCoastalWarnings');
const { seaWarningForSpot, seaWarningLine } = require('./lib/ipmaWarnings');

/** conditions.json committed by the pipeline (observedWave + waveBias meta). */
const CONDITIONS_PATH = path.join(__dirname, '../public/data/conditions.json');
/** Avisos costeiros vivos (coverage por spot) — para o prompt do LLM os mencionar. */
const COASTAL_WARNINGS_PATH = path.join(__dirname, '../public/data/ih-coastal-warnings.json');
/** warnings.json (IPMA/MeteoAlarm) — estado de agitação marítima por spot. */
const WARNINGS_PATH = path.join(__dirname, '../public/data/warnings.json');

/**
 * Best-effort load do ih-coastal-warnings.json (cobertura por spot). Nunca
 * rebenta — sem ficheiro os avisos costeiros simplesmente não entram no prompt.
 */
function loadCoastalWarnings() {
  try {
    if (fs.existsSync(COASTAL_WARNINGS_PATH)) {
      return JSON.parse(fs.readFileSync(COASTAL_WARNINGS_PATH, 'utf-8'));
    }
  } catch (e) {
    console.warn(`   ⚠️ ih-coastal-warnings.json unreadable: ${e.message} — sem avisos costeiros no prompt`);
  }
  return null;
}

/** slug → avisos costeiros em vigor (usa a cobertura já calculada pelo fetch). */
function resolveCoastalBySlug(spotsData, coastalData) {
  const map = new Map();
  if (!coastalData) return map;
  for (const s of spotsData) {
    map.set(s.slug, coastalWarningsForSpot(coastalData, s.slug));
  }
  return map;
}

/**
 * Best-effort load do warnings.json (IPMA/MeteoAlarm). Nunca rebenta — sem
 * ficheiro o estado de agitação marítima simplesmente não entra no prompt.
 */
function loadWarnings() {
  try {
    if (fs.existsSync(WARNINGS_PATH)) {
      return JSON.parse(fs.readFileSync(WARNINGS_PATH, 'utf-8'));
    }
  } catch (e) {
    console.warn(`   ⚠️ warnings.json unreadable: ${e.message} — sem estado de agitação marítima no prompt`);
  }
  return null;
}

/** slug → aviso de agitação marítima mais forte (seaWarningForSpot) ou null. */
function resolveSeaBySlug(spotsData, warningsData) {
  const map = new Map();
  if (!warningsData) return map;
  for (const s of spotsData) {
    map.set(s.slug, seaWarningForSpot(warningsData, s.slug) ?? null);
  }
  return map;
}

/** Nível por extenso (pt) para a linha do prompt. */
const SEA_LEVEL_LABEL_PT = { red: 'Vermelho', orange: 'Laranja', yellow: 'Amarelo' };

/** Linha «Mar perigoso» estruturada para o prompt do LLM (vazia sem aviso). */
function seaWarningPromptLine(sea) {
  if (!sea) return '';
  const level = SEA_LEVEL_LABEL_PT[sea.level] || sea.level;
  const area = sea.areaLabel ? ` — ${sea.areaLabel}` : '';
  return `- ⚠️ Mar perigoso (agitação marítima): ${level}${area}`;
}

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
  const scored = conditions.map((c) => ({ ...c, score: morningScore(c) }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

/**
 * Prompt puro do Dawn Patrol (testável). Para cada spot, inclui as condições
 * matinais + os avisos costeiros do IH em vigor (se houver) e instrui o LLM a
 * mencioná-los no conselho do spot em destaque, em pt e en.
 *
 * @param {Array} spotsData spots com bestWindow/score (shape do generateDawnPatrol)
 * @param {Map<string, Array>} coastalBySlug slug → avisos costeiros
 */
function buildDawnPatrolPrompt(spotsData, coastalBySlug, seaBySlug) {
  const spotsBlock = spotsData.map((s) => {
    const coastal = coastalBySlug?.get(s.slug) ?? [];
    const sea = seaBySlug?.get(s.slug) ?? null;
    return `
${s.name} (${s.region}):
- Ondas: ${s.bestWindow.waveHeight.toFixed(1)}m @ ${s.bestWindow.wavePeriod.toFixed(0)}s
- Vento: ${(s.bestWindow.windSpeed * 1.94384).toFixed(0)} nós
- Água: ${s.bestWindow.waterTemp?.toFixed(1) ?? '--'}°C
- Score: ${s.score}/100${s.scoreSource === 'previsão' ? '' : ' (corrigido: ' + s.scoreSource + ')'}
${coastal.length > 0
  ? `- Avisos costeiros (IH): ${coastal.map((c) => `${c.ref}${c.category ? ` (${c.category})` : ''}`).join('; ')}`
  : ''}${seaWarningPromptLine(sea)}`;
  }).join('');

  return `És um surf advisor experiente para Portugal. Analisa estas condições matinais e dá conselhos curtos e úteis em português (e inglês) para surfistas.

Dados:
${spotsBlock}

Os avisos costeiros do IH (quando listados num spot) são avisos reais à navegação em vigor naquela zona. Se o spot em destaque (topSpot) tiver avisos costeiros, menciona-os de forma curta no advice em pt E en (ex: «Aviso à navegação costeira ANAV NR ... em vigor na zona»), sem entrar em pânico — é informação de segurança.

O estado de AGITAÇÃO MARÍTIMA (linha «Mar perigoso» num spot) é o aviso de segurança mais importante: se o spot em destaque tiver «Mar perigoso», avisa de forma curta no advice em pt E en para não surfar (ex: «⚠️ Mar perigoso — agitação marítima (laranja)»), como o banner de segurança do site — é segurança, não pânico.

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
}

async function generateDawnPatrolWithLLM(spotsData, coastalData, warningsData) {
  if (!spotsData || spotsData.length === 0) {
    return generateBasicAdvice([]);
  }

  const coastalBySlug = resolveCoastalBySlug(spotsData, coastalData);
  const seaBySlug = resolveSeaBySlug(spotsData, warningsData);
  const prompt = buildDawnPatrolPrompt(spotsData, coastalBySlug, seaBySlug);

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
    return generateBasicAdvice(spotsData, coastalBySlug, seaBySlug);
  }
}

function generateBasicAdvice(spotsData, coastalBySlug, seaBySlug) {
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
        moonTideLine: '',
      },
      en: {
        headline: 'Data temporarily unavailable 🌊',
        advice: 'Could not fetch conditions data right now. Check forecasts later or visit each spot\'s individual page.',
        bestTime: '--:--',
        wetsuit: '3/2mm',
        crowdTip: 'Get there early to beat the crowd!',
        moonTideLine: '',
      },
      spots: [],
    };
  }

  const best = spotsData.sort((a, b) => b.score - a.score)[0];
  const windKnots = best.bestWindow.windSpeed * 1.94384;
  const waterTemp = best.bestWindow.waterTemp;

  const wetsuit = waterTemp > 18 ? '2mm shorty' : waterTemp > 15 ? '3/2mm' : waterTemp > 12 ? '4/3mm' : '5/4mm com capuz';
  const wetsuitEn = waterTemp > 18 ? '2mm shorty' : waterTemp > 15 ? '3/2mm' : waterTemp > 12 ? '4/3mm' : '5/4mm with hood';

  // Fallback sem LLM: o melhor spot também menciona os avisos costeiros em vigor
  // (pt/en), como o prompt pediria ao LLM — a strip já os mostra, aqui são
  // repetidos no próprio texto do conselho.
  const coastal = coastalBySlug?.get(best.slug) ?? [];
  const coastalPt = coastalWarningLine(coastal, true);
  const coastalEn = coastalWarningLine(coastal, false);

  // Estado de agitação marítima do melhor spot — mesma redacção do hero/Telegram
  // («⚠️ Mar perigoso — agitação marítima (laranja)»), repetido no conselho.
  const sea = seaBySlug?.get(best.slug) ?? null;
  const seaPt = seaWarningLine(sea, true);
  const seaEn = seaWarningLine(sea, false);

  return {
    date,
    generatedAt: new Date().toISOString(),
    topSpot: best.name,
    topSpotSlug: best.slug,
    pt: {
      headline: `Hoje é dia de ${best.name}! 🌊`,
      advice: `Melhor janela: ${best.bestWindow.hour}:00h. Ondas de ${best.bestWindow.waveHeight.toFixed(1)}m com ${(windKnots).toFixed(0)} nós de vento.${coastalPt ? ` ${coastalPt}` : ''}${seaPt ? ` ${seaPt}` : ''}`,
      bestTime: `${best.bestWindow.hour}:00`,
      wetsuit,
      crowdTip: 'Chega cedo para evitar crowd!',
    },
    en: {
      headline: `Today is ${best.name} day! 🌊`,
      advice: `Best window: ${best.bestWindow.hour}:00. ${best.bestWindow.waveHeight.toFixed(1)}m waves with ${(windKnots).toFixed(0)} knot wind.${coastalEn ? ` ${coastalEn}` : ''}${seaEn ? ` ${seaEn}` : ''}`,
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
    score: s.score,
    scoreForecast: s.scoreForecast,
    scoreSource: s.scoreSource,
    scoreMeta: s.scoreMeta ?? null,
    verdict: s.score >= 70 ? 'go' : s.score >= 50 ? 'maybe' : 'skip',
    ptReason: s.score >= 70 ? 'Condições excelentes' : s.score >= 50 ? 'Condições razoáveis' : 'Não vale a pena',
    enReason: s.score >= 70 ? 'Excellent conditions' : s.score >= 50 ? 'Fair conditions' : 'Not worth it',
  }));
}

/**
 * Override the LLM-echoed per-spot scores with the computed recalibrated ones
 * (score = buoy-corrected, scoreForecast = forecast-only, scoreSource/meta for
 * the UI) — the advice data must carry what the spot page shows this morning.
 */
function attachScoreRecalibration(advice, spotsData) {
  const bySlug = new Map(spotsData.map((s) => [s.slug, s]));
  if (Array.isArray(advice.spots)) {
    advice.spots = advice.spots.map((s) => {
      const src = bySlug.get(s.slug);
      if (!src) return s;
      return {
        ...s,
        score: src.score,
        scoreForecast: src.scoreForecast,
        scoreSource: src.scoreSource,
        scoreMeta: src.scoreMeta ?? null,
      };
    });
  }
  if (advice.topSpotSlug && bySlug.has(advice.topSpotSlug)) {
    const top = bySlug.get(advice.topSpotSlug);
    // O hero do banner mostra o score recalibrado do spot em destaque — leva
    // também a fonte/previsão/meta para a UI o rotular honestamente, igual aos
    // vereditos da lista (nunca só o número).
    advice.topScore = top.score;
    advice.topScoreForecast = top.scoreForecast;
    advice.topScoreSource = top.scoreSource;
    advice.topScoreMeta = top.scoreMeta ?? null;
  }
  return advice;
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

  const conditionsJson = (() => {
    try {
      if (fs.existsSync(CONDITIONS_PATH)) {
        return JSON.parse(fs.readFileSync(CONDITIONS_PATH, 'utf-8'));
      }
    } catch (e) {
      console.warn(`   ⚠️ conditions.json unreadable: ${e.message} — sem recalibração por boia`);
    }
    return null;
  })();
  if (conditionsJson) {
    console.log('   📡 conditions.json loaded — score recalibrated by buoy layer when fresh');
  }

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

    // Recalibração pela boia (leitura fresca) ou pelo viés regional da row —
    // o score que o utilizador vê na manhã seguinte é o mesmo da página do spot.
    const recal = resolveMorningRecalibration(spot, bestWindow, conditionsJson);
    const recalibratedScore = recal ? morningScore({ ...bestWindow, waveHeight: recal.height }) : bestWindow.score;

    spotsData.push({
      ...spot,
      bestWindow,
      allConditions: morningConditions,
      hourly,
      score: recalibratedScore,
      scoreForecast: bestWindow.score,
      scoreSource: recal ? recal.source : 'previsão',
      scoreMeta: recal ? recal.meta : null,
    });
  }

  console.log(`   Analyzed ${spotsData.length} spots`);

  const coastalData = loadCoastalWarnings();
  if (coastalData) {
    const covered = spotsData.filter((s) => coastalWarningsForSpot(coastalData, s.slug).length > 0);
    if (covered.length > 0) {
      console.log(`   ⚓ Coastal warnings (IH): ${covered.length} spot(s) cobertos no prompt do LLM`);
    }
  }

  const warningsData = loadWarnings();
  if (warningsData) {
    const covered = spotsData.filter((s) => seaWarningForSpot(warningsData, s.slug));
    if (covered.length > 0) {
      console.log(`   🌊 Sea-state warnings (Mar perigoso): ${covered.length} spot(s) no prompt do LLM`);
    }
  }

  let advice = await generateDawnPatrolWithLLM(spotsData, coastalData, warningsData);
  advice = validateAdviceSlugs(advice, validSlugs, spotsData);
  advice = attachMoonTideLines(advice, spotsData);
  advice = attachScoreRecalibration(advice, spotsData);

  const outputPath = path.join(__dirname, '../public/data/dawn-patrol.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(advice, null, 2));

  console.log(`\n✅ Dawn Patrol saved to ${outputPath}`);
  console.log(`📍 Top spot: ${advice.topSpot}`);
  console.log(`⏰ Best time: ${advice.pt.bestTime}`);
  console.log(`🤙 ${advice.pt.headline}`);
}

// Guard require.main: o script só corre sozinho (CLI/workflow). Requerido por
// testes unit (buildDawnPatrolPrompt/resolveCoastalBySlug) não dispara a rede.
if (require.main === module) {
  generateDawnPatrol().catch(e => {
    console.error('❌ Fatal error in dawn-patrol:', e);
    process.exit(1);
  });
}

module.exports = {
  buildDawnPatrolPrompt,
  generateBasicAdvice,
  resolveCoastalBySlug,
  resolveSeaBySlug,
  seaWarningPromptLine,
  loadCoastalWarnings,
  loadWarnings,
};
