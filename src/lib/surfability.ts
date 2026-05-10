/**
 * WindSpot Surfability Score Algorithm
 * Calcula um score 0-100 para cada spot baseado nas condições reais
 * vs. as condições ideais desse spot específico
 */

import { Spot } from '@/types';

export interface SurfabilityInput {
  waveHeight: number;      // metros
  wavePeriod: number;      // segundos
  waveDirection: number;   // graus (0-360)
  windSpeed: number;       // km/h
  windDirection: number;   // graus (0-360)
  waterTemp?: number;      // °C (opcional)
}

export interface SurfabilityResult {
  score: number;           // 0-100
  rating: string;         // texto PT
  ratingEn: string;       // texto EN
  stars: number;          // 1-5
  color: string;          // tailwind class
  details: {
    waveScore: number;    // 0-100
    windScore: number;    // 0-100
    periodScore: number;  // 0-100
    overallScore: number; // 0-100
  };
  recommendation: string;
  recommendationEn: string;
}

// Parse wind/swell directions from string like "N, NNE, NE" to array of degrees
function parseDirections(dirString: string): number[] {
  const dirMap: Record<string, number> = {
    'N': 0, 'NNE': 22.5, 'NE': 45, 'ENE': 67.5,
    'E': 90, 'ESE': 112.5, 'SE': 135, 'SSE': 157.5,
    'S': 180, 'SSW': 202.5, 'SW': 225, 'WSW': 247.5,
    'W': 270, 'WNW': 292.5, 'NW': 315, 'NNW': 337.5,
  };
  return dirString.split(',').map(d => dirMap[d.trim()]).filter(v => v !== undefined);
}

// Calculate angular difference (0-180)
function angularDiff(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 360 - diff);
}

// Score based on how close actual direction is to ideal
function directionScore(actual: number, ideals: number[]): number {
  if (ideals.length === 0) return 50;
  const diffs = ideals.map(ideal => angularDiff(actual, ideal));
  const bestDiff = Math.min(...diffs);
  // 0° diff = 100, 45° diff = 50, 90° diff = 0
  return Math.max(0, 100 - (bestDiff * 100 / 90));
}

// Wave height score based on spot type
function waveHeightScore(height: number, spotType: Spot['type']): number {
  const idealRanges: Record<string, { min: number; max: number; optimal: number }> = {
    'surf': { min: 0.5, max: 3.0, optimal: 1.5 },
    'kitesurf': { min: 0.3, max: 2.5, optimal: 1.0 },
    'windsurf': { min: 0.5, max: 3.0, optimal: 1.5 },
    'big-wave': { min: 2.0, max: 15.0, optimal: 5.0 },
    'foil': { min: 0.3, max: 2.0, optimal: 0.8 },
    'wakeboard': { min: 0, max: 0.5, optimal: 0 },
    'multisport': { min: 0.5, max: 3.0, optimal: 1.5 },
  };

  const range = idealRanges[spotType] || idealRanges['surf'];

  if (height < range.min * 0.5) return 10; // Too small
  if (height > range.max * 1.5) return height > range.max * 2 ? 10 : 40; // Too big/dangerous

  // Score peaks at optimal, decreases towards edges
  const distFromOptimal = Math.abs(height - range.optimal);
  const maxDist = Math.max(range.optimal - range.min, range.max - range.optimal);
  const score = 100 - (distFromOptimal / maxDist) * 60;

  return Math.max(20, Math.min(100, score));
}

// Period score — longer period = better quality
function wavePeriodScore(period: number, spotType: Spot['type']): number {
  const minPeriod = spotType === 'big-wave' ? 12 : 8;
  const optimalPeriod = spotType === 'big-wave' ? 16 : 12;

  if (period < 4) return 10; // Wind swell, messy
  if (period < minPeriod) return 30 + (period - 4) * 10; // Building
  if (period >= optimalPeriod) return 100; // Perfect

  // Linear between min and optimal
  return 50 + ((period - minPeriod) / (optimalPeriod - minPeriod)) * 50;
}

// Wind score — offshore is best, onshore is worst
function windScore(speed: number, direction: number, idealWindDirs: number[]): number {
  // Direction score
  const dirScore = directionScore(direction, idealWindDirs);

  // Speed score — too strong is bad even if offshore
  let speedScore = 100;
  if (speed < 5) speedScore = 80; // Too light, glassy but no push
  else if (speed > 40) speedScore = 20; // Too strong, dangerous
  else if (speed > 30) speedScore = 50; // Strong, hard conditions
  else if (speed > 20) speedScore = 80; // Moderate, good
  else speedScore = 95; // Light, perfect

  // Combine — if wind is onshore (low dirScore), speed matters less
  // If wind is offshore (high dirScore), speed matters more
  return (dirScore * 0.6) + (speedScore * 0.4);
}

// Get rating text based on score
function getRating(score: number): { rating: string; ratingEn: string; stars: number; color: string } {
  if (score >= 90) return { rating: 'ÉPICO! 🔥', ratingEn: 'EPIC! 🔥', stars: 5, color: 'bg-red-500' };
  if (score >= 75) return { rating: 'FIRE! ⚡', ratingEn: 'FIRE! ⚡', stars: 4, color: 'bg-orange-500' };
  if (score >= 60) return { rating: 'BOM! 👍', ratingEn: 'GOOD! 👍', stars: 3, color: 'bg-yellow-500' };
  if (score >= 40) return { rating: 'Razoável', ratingEn: 'Fair', stars: 2, color: 'bg-blue-400' };
  if (score >= 20) return { rating: 'Fraco', ratingEn: 'Poor', stars: 1, color: 'bg-gray-400' };
  return { rating: 'Não Vale a Pena', ratingEn: 'Not Worth It', stars: 0, color: 'bg-gray-600' };
}

// Get recommendation text
function getRecommendation(score: number, spotName: string): { text: string; textEn: string } {
  if (score >= 90) return {
    text: `NÃO PERCAS! ${spotName} está épico hoje! 🏄‍♂️🔥`,
    textEn: `DON'T MISS! ${spotName} is epic today! 🏄‍♂️🔥`,
  };
  if (score >= 75) return {
    text: `Ótimas condições em ${spotName}! Vai lá! ⚡`,
    textEn: `Great conditions at ${spotName}! Go for it! ⚡`,
  };
  if (score >= 60) return {
    text: `${spotName} tá bom hoje. Vale a pena uma sessão! 👍`,
    textEn: `${spotName} is good today. Worth a session! 👍`,
  };
  if (score >= 40) return {
    text: `${spotName} tá razoável. Se não tens outra opção... 🤷`,
    textEn: `${spotName} is fair. If you have no other option... 🤷`,
  };
  if (score >= 20) return {
    text: `${spotName} não tá grande coisa hoje. Talvez amanhã? 😴`,
    textEn: `${spotName} is not great today. Maybe tomorrow? 😴`,
  };
  return {
    text: `${spotName} tá flat ou vento forte. Evita hoje. ❌`,
    textEn: `${spotName} is flat or windy. Skip today. ❌`,
  };
}

/**
 * Calculate Surfability Score for a spot
 */
export function calculateSurfability(
  spot: Spot,
  conditions: SurfabilityInput
): SurfabilityResult {
  const idealSwellDirs = parseDirections(spot.bestSwell);
  const idealWindDirs = parseDirections(spot.bestWind);

  const waveHScore = waveHeightScore(conditions.waveHeight, spot.type);
  const periodScore = wavePeriodScore(conditions.wavePeriod, spot.type);
  const swellDirScore = directionScore(conditions.waveDirection, idealSwellDirs);
  const windS = windScore(conditions.windSpeed, conditions.windDirection, idealWindDirs);

  // Weighted combination
  // Wave height matters most, then wind, then period, then swell direction
  const overallScore = Math.round(
    (waveHScore * 0.30) +
    (windS * 0.30) +
    (periodScore * 0.25) +
    (swellDirScore * 0.15)
  );

  const rating = getRating(overallScore);
  const rec = getRecommendation(overallScore, spot.name);

  return {
    score: overallScore,
    rating: rating.rating,
    ratingEn: rating.ratingEn,
    stars: rating.stars,
    color: rating.color,
    details: {
      waveScore: Math.round(waveHScore),
      windScore: Math.round(windS),
      periodScore: Math.round(periodScore),
      overallScore,
    },
    recommendation: rec.text,
    recommendationEn: rec.textEn,
  };
}

/**
 * Get session quality for next hours
 * Returns array of { hour, score, label } for next 12 hours
 */
export function getSessionForecast(
  spot: Spot,
  hourlyData: {
    time: string[];
    wave_height: number[];
    wave_period: number[];
    wave_direction: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
  }
): Array<{ time: string; score: number; rating: string; waveHeight: number; wavePeriod: number; windSpeed: number; windDirection: number }> {
  const count = Math.min(12, hourlyData.time.length);
  return Array.from({ length: count }, (_, i) => {
    const result = calculateSurfability(spot, {
      waveHeight: hourlyData.wave_height[i] || 0,
      wavePeriod: hourlyData.wave_period[i] || 0,
      waveDirection: hourlyData.wave_direction[i] || 0,
      windSpeed: hourlyData.wind_speed_10m[i] || 0,
      windDirection: hourlyData.wind_direction_10m[i] || 0,
    });

    return {
      time: hourlyData.time[i],
      score: result.score,
      rating: result.rating,
      waveHeight: hourlyData.wave_height[i] || 0,
      wavePeriod: hourlyData.wave_period[i] || 0,
      windSpeed: hourlyData.wind_speed_10m[i] || 0,
      windDirection: hourlyData.wind_direction_10m[i] || 0,
    };
  });
}

/**
 * Crowd estimate based on conditions + day
 */
export function estimateCrowd(
  score: number,
  isWeekend: boolean,
  isSummer: boolean,
  spotDifficulty: Spot['difficulty']
): { level: string; levelEn: string; icon: string; count: string } {
  let baseCrowd = score > 70 ? 30 : score > 50 ? 20 : 10;

  if (isWeekend) baseCrowd *= 1.5;
  if (isSummer) baseCrowd *= 1.3;
  if (spotDifficulty === 'beginner') baseCrowd *= 1.3;
  if (spotDifficulty === 'expert') baseCrowd *= 0.6;

  baseCrowd = Math.round(baseCrowd);

  if (baseCrowd < 10) return { level: 'Vazio', levelEn: 'Empty', icon: '🟢', count: '< 10' };
  if (baseCrowd < 20) return { level: 'Tranquilo', levelEn: 'Quiet', icon: '🟢', count: '10-20' };
  if (baseCrowd < 35) return { level: 'Médio', levelEn: 'Moderate', icon: '🟡', count: '20-35' };
  if (baseCrowd < 50) return { level: 'Crowded', levelEn: 'Crowded', icon: '🟠', count: '35-50' };
  return { level: 'Lotado', levelEn: 'Packed', icon: '🔴', count: '50+' };
}

/**
 * Get color for score display
 */
export function getScoreColor(score: number): { bg: string; text: string; border: string; glow: string } {
  if (score >= 90) return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/50', glow: 'shadow-red-500/20' };
  if (score >= 75) return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/50', glow: 'shadow-orange-500/20' };
  if (score >= 60) return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/50', glow: 'shadow-yellow-500/20' };
  if (score >= 40) return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/50', glow: 'shadow-blue-500/20' };
  return { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/50', glow: 'shadow-gray-500/20' };
}
