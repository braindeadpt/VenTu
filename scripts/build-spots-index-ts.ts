/**
 * Build spots-index.json using sportScore.ts (single source of truth).
 * Usage: npx tsx scripts/build-spots-index-ts.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spots } from '../src/lib/spots';
import { getAllSportScores, type SportScore } from '../src/lib/sportScore';
import type { SportType } from '../src/lib/sportRatings';
import { pickConfidenceFields } from '../src/lib/forecastConfidence';

type ConditionsJson = Record<
  string,
  {
    waveHeight?: number;
    wavePeriod?: number;
    waveDirection?: number;
    windSpeed?: number;
    windDirection?: number;
    windGust?: number;
    waterTemp?: number;
    updatedAt?: string;
    [key: string]: unknown;
  }
>;

const CALM_LAKE = {
  waveHeight: 0,
  wavePeriod: 0,
  waveDirection: 0,
  windSpeed: 0,
  windDirection: 0,
  windGust: 0,
  waterTemp: 18,
};

function isWakeboardOnly(spot: (typeof spots)[0]) {
  return (
    spot.type === 'wakeboard' ||
    (spot.compatibleSports?.length === 1 && spot.compatibleSports[0] === 'wakeboard')
  );
}

function toScoreInput(cond: ConditionsJson[string]) {
  return {
    waveHeight: cond.waveHeight ?? 0,
    wavePeriod: cond.wavePeriod ?? 0,
    waveDirection: cond.waveDirection ?? 0,
    windSpeed: cond.windSpeed ?? 0,
    windDirection: cond.windDirection ?? 0,
    windGust: cond.windGust ?? 0,
    waterTemp: cond.waterTemp ?? 0,
  };
}

function build() {
  const conditionsPath = join(process.cwd(), 'public', 'data', 'conditions.json');
  let conditionsData: ConditionsJson = {};
  if (existsSync(conditionsPath)) {
    conditionsData = JSON.parse(readFileSync(conditionsPath, 'utf-8'));
  }

  console.log(`[spots-index] ${spots.length} spots in spots.ts`);
  console.log(`[spots-index] ${Object.keys(conditionsData).length} entries in conditions.json`);

  const index = spots.map((spot) => {
    const cond = conditionsData[spot.id];
    const useLakeDefault = !cond && isWakeboardOnly(spot);
    if (!cond && !useLakeDefault) {
      return {
        id: spot.id,
        slug: spot.slug,
        name: spot.name,
        nameEn: spot.nameEn,
        region: spot.region,
        regionEn: spot.regionEn,
        lat: spot.lat,
        lon: spot.lon,
        coastOrientation: spot.coastOrientation,
        type: spot.type,
        difficulty: spot.difficulty,
        compatibleSports: spot.compatibleSports ?? [],
        description: spot.description ?? '',
        descriptionEn: spot.descriptionEn ?? '',
        facilities: spot.facilities ?? [],
        hazards: spot.hazards ?? [],
        blueFlag: spot.blueFlag ?? false,
        accessibleBeach: spot.accessibleBeach ?? false,
        conditions: null,
        allScores: null,
        bestScore: 0,
      };
    }

    const scoreInput = cond ? toScoreInput(cond) : CALM_LAKE;
    const conditions = {
      ...scoreInput,
      updatedAt: cond?.updatedAt ?? new Date().toISOString(),
      ...pickConfidenceFields((cond ?? {}) as Record<string, unknown>),
    };

    const allScores = getAllSportScores(spot, scoreInput);
    const bestScore = Math.max(...Object.values(allScores).map((s) => s.score), 0);

    return {
      id: spot.id,
      slug: spot.slug,
      name: spot.name,
      nameEn: spot.nameEn,
      region: spot.region,
      regionEn: spot.regionEn,
      lat: spot.lat,
      lon: spot.lon,
      coastOrientation: spot.coastOrientation,
      type: spot.type,
      difficulty: spot.difficulty,
      compatibleSports: spot.compatibleSports ?? [],
      description: spot.description ?? '',
      descriptionEn: spot.descriptionEn ?? '',
      facilities: spot.facilities ?? [],
      hazards: spot.hazards ?? [],
      blueFlag: spot.blueFlag ?? false,
      accessibleBeach: spot.accessibleBeach ?? false,
      conditions,
      allScores: allScores as Record<SportType, SportScore>,
      bestScore,
    };
  });

  index.sort((a, b) => b.bestScore - a.bestScore);

  const outPath = join(process.cwd(), 'public', 'data', 'spots-index.json');
  writeFileSync(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), spots: index }, null, 2),
  );
  const withScores = index.filter((e) => e.allScores).length;
  console.log(`[spots-index] Written ${index.length} entries (${withScores} with scores) → ${outPath}`);
}

build();
