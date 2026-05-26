/**
 * build-spots-index.js
 *
 * Pre-computes sport scores for every spot and writes them to
 * public/data/spots-index.json, so the homepage and /spots pages
 * can read scores directly instead of calculating them at render time.
 *
 * Usage:  node scripts/build-spots-index.js
 * Deps:   Node 18+ (fs, path only)
 *
 * Run as part of `npm run data:update` or via CI before `next build`.
 */

const fs = require('fs');
const path = require('path');

// ── helpers ──────────────────────────────────────────────────────────

function parseSpots() {
  const spotsPath = path.join(__dirname, '..', 'src', 'lib', 'spots.ts');
  const content = fs.readFileSync(spotsPath, 'utf-8');

  // Each spot block: { id: '...', ... }
  const blockRegex = /{\s*id:\s*'([^']+)'([^}]+)}/g;
  const spots = [];
  let match;

  while ((match = blockRegex.exec(content)) !== null) {
    const id = match[1];
    const block = match[2];

    const extract = (key) => {
      const kv = new RegExp(`\\b${key}:\\s*(['\"]?)([^,'\"}\\n]+)\\1`, 'm');
      const m = block.match(kv);
      return m ? m[2].trim() : '';
    };

    const extractNum = (key) => {
      const m = block.match(new RegExp(`\\b${key}:\\s*([0-9.-]+)`));
      return m ? parseFloat(m[1]) : 0;
    };

    const extractArr = (key) => {
      const m = block.match(new RegExp(`${key}:\\s*\\[([^\\]]+)\\]`));
      if (!m) return [];
      return m[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
    };

    const extractBool = (key) => {
      return block.includes(`${key}: true`);
    };

    const extractObj = (key) => {
      // bestTide / bestTideEn etc. inside localTips
      const m = block.match(new RegExp(`${key}:\\s*'([^']+)'`));
      return m ? m[1] : undefined;
    };

    // localTips might be a nested object
    let localTips = undefined;
    const tipsStart = block.indexOf('localTips:');
    if (tipsStart !== -1) {
      // find the matching closing }
      let braceCount = 0;
      let started = false;
      let tipsStr = '';
      for (let i = tipsStart + 'localTips:'.length; i < block.length; i++) {
        const ch = block[i];
        if (ch === '{') { braceCount++; started = true; }
        if (started) tipsStr += ch;
        if (ch === '}') { braceCount--; if (braceCount === 0) break; }
      }
      if (tipsStr) {
        const t = {};
        ['bestTide', 'bestTideEn', 'parking', 'parkingEn', 'food', 'foodEn', 'localRule', 'localRuleEn'].forEach(k => {
          const v = tipsStr.match(new RegExp(`${k}:\\s*'([^']+)'`));
          if (v) t[k] = v[1];
        });
        if (Object.keys(t).length > 0) localTips = t;
      }
    }

    spots.push({
      id,
      slug: extract('slug'),
      name: extract('name'),
      nameEn: extract('nameEn'),
      region: extract('region'),
      regionEn: extract('regionEn'),
      lat: extractNum('lat'),
      lon: extractNum('lon'),
      coastOrientation: extractNum('coastOrientation'),
      type: extract('type'),
      difficulty: extract('difficulty'),
      compatibleSports: extractArr('compatibleSports'),
      description: extract('description'),
      descriptionEn: extract('descriptionEn'),
      facilities: extractArr('facilities'),
      hazards: extractArr('hazards'),
      blueFlag: extractBool('blueFlag'),
      accessibleBeach: extractBool('accessibleBeach'),
      waterQuality: extractObj('waterQuality'),
      waterQualityEn: extractObj('waterQualityEn'),
      localTips,
    });
  }

  return spots;
}

// ── scoring logic (mirrors src/lib/sportScore.ts) ────────────────────

function windMsToKt(ms) { return ms * 1.94384; }

function getRatingLabels(score) {
  if (score >= 85) return { rating: 'Épico!', ratingEn: 'Epic!' };
  if (score >= 70) return { rating: 'Bom', ratingEn: 'Good' };
  if (score >= 50) return { rating: 'Razoável', ratingEn: 'Fair' };
  if (score >= 30) return { rating: 'Fraco', ratingEn: 'Poor' };
  if (score > 0) return { rating: 'Mau', ratingEn: 'Bad' };
  return { rating: 'N/A', ratingEn: 'N/A' };
}

function scoreSurf(spot, c) {
  const factors = [];
  let score = 0;
  const windKt = windMsToKt(c.windSpeed);
  const waveScore = Math.min(c.waveHeight * 15, 40);
  score += waveScore;
  if (c.waveHeight > 0.5) factors.push(`${c.waveHeight.toFixed(1)}m ondas`);
  const periodScore = Math.min((c.wavePeriod - 5) * 3, 20);
  score += Math.max(0, periodScore);
  if (c.wavePeriod > 8) factors.push(`${c.wavePeriod.toFixed(0)}s período`);
  const angleDiff = Math.abs(c.windDirection - (spot.coastOrientation || 270));
  const normalizedDiff = angleDiff > 180 ? 360 - angleDiff : angleDiff;
  const isOffshore = normalizedDiff > 90;
  const windScore = isOffshore ? Math.max(0, 25 - windKt * 0.5) : Math.max(0, 15 - windKt * 0.3);
  score += windScore;
  if (isOffshore) factors.push('Vento offshore');
  else if (windKt < 10) factors.push('Vento fraco');
  score += Math.min(c.waterTemp * 0.5, 15);
  score = Math.round(Math.min(100, Math.max(0, score)));
  return { score, ...getRatingLabels(score), factors, primaryFactor: `${c.waveHeight.toFixed(1)}m @ ${c.wavePeriod.toFixed(0)}s` };
}

function scoreKitesurf(spot, c) {
  const factors = [];
  let score = 0;
  const windKt = windMsToKt(c.windSpeed);
  let windScore = 0;
  if (windKt >= 15 && windKt <= 30) { windScore = 60; factors.push(`${windKt.toFixed(0)}kt vento`); }
  else if (windKt > 30) { windScore = 50; factors.push(`${windKt.toFixed(0)}kt vento forte`); }
  else if (windKt >= 10) { windScore = windKt * 2; factors.push(`${windKt.toFixed(0)}kt vento`); }
  score += windScore;
  const gustDiff = c.windGust - c.windSpeed;
  score += gustDiff < 10 ? 15 : gustDiff < 20 ? 10 : 5;
  if (c.waveHeight < 1.5) { score += 15; factors.push('Ondas pequenas'); }
  else if (c.waveHeight < 2.5) { score += 8; }
  score += Math.min(c.waterTemp * 0.3, 10);
  score = Math.round(Math.min(100, Math.max(0, score)));
  const warning = windKt > 35 ? 'Vento muito forte — apenas avançados' : windKt < 12 ? 'Vento fraco — precisa de kite grande' : undefined;
  return { score, ...getRatingLabels(score), factors, warning, primaryFactor: `${windKt.toFixed(0)}kt` };
}

function scoreWindsurf(spot, c) {
  const factors = [];
  let score = 0;
  const windKt = windMsToKt(c.windSpeed);
  if (windKt >= 15 && windKt <= 28) { score += 55; factors.push(`${windKt.toFixed(0)}kt vento`); }
  else if (windKt >= 10) { score += windKt * 2; factors.push(`${windKt.toFixed(0)}kt vento`); }
  if (c.waveHeight > 1 && c.waveHeight < 3) { score += 20; factors.push(`${c.waveHeight.toFixed(1)}m ondas`); }
  else if (c.waveHeight < 4) { score += 10; }
  score += 15;
  score += Math.min(c.waterTemp * 0.3, 10);
  score = Math.round(Math.min(100, Math.max(0, score)));
  return { score, ...getRatingLabels(score), factors, primaryFactor: `${windKt.toFixed(0)}kt` };
}

function scoreWakeboard(spot, c) {
  const hasCablePark = (spot.facilities || []).some(f =>
    f.toLowerCase().includes('cable') || f.toLowerCase().includes('wake') || f.toLowerCase().includes('lagoa')
  ) || spot.type === 'wakeboard';
  if (!hasCablePark) {
    return { score: 0, rating: 'N/A', ratingEn: 'N/A', factors: ['Sem cable park'], warning: 'Este spot não tem infraestrutura para wakeboard', primaryFactor: 'N/A' };
  }
  return { score: 80, rating: 'Disponível', ratingEn: 'Available', factors: ['Cable park disponível'], primaryFactor: 'Cable Park' };
}

function scoreBodyboard(spot, c) {
  const factors = [];
  let score = 0;
  const windKt = windMsToKt(c.windSpeed);
  const waveScore = Math.min(c.waveHeight * 18, 45);
  score += waveScore;
  if (c.waveHeight > 0.3) factors.push(`${c.waveHeight.toFixed(1)}m ondas`);
  score += Math.min((c.wavePeriod - 4) * 3, 20);
  if (c.wavePeriod > 6) factors.push(`${c.wavePeriod.toFixed(0)}s período`);
  score += Math.max(0, 25 - windKt * 0.4);
  score += Math.min(c.waterTemp * 0.4, 10);
  score = Math.round(Math.min(100, Math.max(0, score)));
  return { score, ...getRatingLabels(score), factors, primaryFactor: `${c.waveHeight.toFixed(1)}m` };
}

function scoreSUP(spot, c) {
  const factors = [];
  let score = 0;
  const windKt = windMsToKt(c.windSpeed);
  if (c.waveHeight < 0.5) { score += 40; factors.push('Água plana'); }
  else if (c.waveHeight < 1) { score += 30; factors.push('Ondas pequenas'); }
  else if (c.waveHeight < 1.5) { score += 15; }
  if (windKt < 15) { score += 30; factors.push('Vento fraco'); }
  else if (windKt < 25) { score += 15; }
  score += Math.min(c.waterTemp * 0.6, 20);
  if (c.waterTemp > 15) factors.push(`${c.waterTemp.toFixed(0)}°C água`);
  score += Math.max(0, 10 - c.wavePeriod * 0.5);
  score = Math.round(Math.min(100, Math.max(0, score)));
  return { score, ...getRatingLabels(score), factors, primaryFactor: c.waveHeight < 0.5 ? 'Plano' : `${c.waveHeight.toFixed(1)}m` };
}

function scoreFoil(spot, c) {
  const factors = [];
  const windKt = windMsToKt(c.windSpeed);
  let score = 0;
  if (windKt >= 10 && windKt <= 25) { score += 50; factors.push(`${windKt.toFixed(0)}kt vento ideal`); }
  else if (windKt >= 5 && windKt < 10) { score += 25; factors.push('Vento fraco'); }
  else if (windKt > 25 && windKt <= 35) { score += 20; factors.push('Vento forte'); }
  else { score += 5; }
  if (c.waveHeight < 0.5) { score += 25; factors.push('Água plana'); }
  else if (c.waveHeight < 1.0) { score += 15; }
  else if (c.waveHeight < 1.5) { score += 5; }
  score += Math.min(c.waterTemp * 0.4, 15);
  score = Math.round(Math.min(100, Math.max(0, score)));
  return { score, ...getRatingLabels(score), factors, primaryFactor: windKt >= 10 && windKt <= 25 ? 'Vento ideal' : `${windKt.toFixed(0)}kt` };
}

const SCORERS = {
  surf: scoreSurf,
  kitesurf: scoreKitesurf,
  windsurf: scoreWindsurf,
  wakeboard: scoreWakeboard,
  bodyboard: scoreBodyboard,
  sup: scoreSUP,
  foil: scoreFoil,
};

function getAllSportScores(spot, conditions) {
  const scores = {};
  for (const [sport, fn] of Object.entries(SCORERS)) {
    scores[sport] = fn(spot, conditions);
  }
  return scores;
}

// ── main ─────────────────────────────────────────────────────────────

function build() {
  console.log('[spots-index] Parsing spots from src/lib/spots.ts...');
  const spots = parseSpots();
  console.log(`[spots-index] Found ${spots.length} spots.`);

  const conditionsPath = path.join(__dirname, '..', 'public', 'data', 'conditions.json');
  let conditionsData = {};
  try {
    if (fs.existsSync(conditionsPath)) {
      conditionsData = JSON.parse(fs.readFileSync(conditionsPath, 'utf-8'));
      console.log(`[spots-index] Loaded conditions for ${Object.keys(conditionsData).length} spots.`);
    } else {
      console.warn('[spots-index] conditions.json not found — scores will be null.');
    }
  } catch (e) {
    console.warn('[spots-index] Failed to parse conditions.json:', e.message);
  }

  const index = [];
  for (const spot of spots) {
    const cond = conditionsData[spot.id];
    if (!cond) {
      // spot has no conditions data — include it with null scores
      index.push({
        ...spot,
        conditions: null,
        allScores: null,
        bestScore: 0,
      });
      continue;
    }

    const conditions = {
      waveHeight: cond.waveHeight || 0,
      wavePeriod: cond.wavePeriod || 0,
      waveDirection: cond.waveDirection || 0,
      windSpeed: cond.windSpeed || 0,
      windDirection: cond.windDirection || 0,
      windGust: cond.windGust || 0,
      waterTemp: cond.waterTemp || 0,
      updatedAt: cond.updatedAt || null,
    };

    const allScores = getAllSportScores(spot, conditions);
    const bestScore = Math.max(...Object.values(allScores).map(s => s.score), 0);

    index.push({
      ...spot,
      conditions,
      allScores,
      bestScore,
    });
  }

  // Sort by best score descending (like loadSpotData does)
  index.sort((a, b) => b.bestScore - a.bestScore);

  const outPath = path.join(__dirname, '..', 'public', 'data', 'spots-index.json');
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), spots: index }, null, 2));
  console.log(`[spots-index] Written ${index.length} entries to ${outPath}`);
}

build();
