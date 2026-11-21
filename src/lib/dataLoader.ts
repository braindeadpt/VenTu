// Data loader for pre-computed conditions
// Reads public/data/conditions.json at build time
// Falls back to live fetch only if JSON is missing/empty

import { spots } from './spots';
import { getConditionsDataId } from './spotConditionsSource';
import type { WaterQualityLive } from './waterQuality';

export interface PrecomputedConditions {
  [spotId: string]: {
    waveHeight: number;
    wavePeriod: number;
    waveDirection: number;
    windSpeed: number;
    windDirection: number;
    windGust: number;
    waterTemp: number;
    tideHeight?: number;
    tideStatus?: 'high' | 'low' | 'rising' | 'falling';
    tideLabel?: string;
    tideObservedHeight?: number;
    tideObservedAt?: string;
    tideStation?: string;
    tideAnomalyM?: number;
    currentMeasuredSpeed?: number;
    currentMeasuredDir?: number;
    currentMeasuredAt?: string;
    currentMeasuredNetwork?: string;
    waterQuality?: WaterQualityLive;
    updatedAt: string;
    /** Carry-over da pipeline: o fetch desta run falhou — entrada reaproveitada do run anterior. */
    carriedOver?: boolean;
    /** Instante do fetch original reaproveitado (= `updatedAt` quando carriedOver). */
    carriedFromFetchedAt?: string;
    confidence?: 'alta' | 'média' | 'baixa';
    confidenceDetail?: {
      waveSpread: number;
      windSpread: number;
      waveSpreadPct?: number;
      windSpreadPct?: number;
      combinedSpreadPct?: number;
      degraded?: boolean;
    };
    dailyConfidence?: Array<{
      date: string;
      confidence: 'alta' | 'média' | 'baixa';
      waveSpread: number;
      windSpread: number;
      degraded?: boolean;
    }>;
  };
}

/**
 * Load pre-computed conditions from the JSON file.
 * This runs at BUILD TIME (server-side) for static generation.
 */
export function loadPrecomputedConditions(): PrecomputedConditions {
  // In Node.js / build time, read from file system
  if (typeof window === 'undefined') {
    try {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), 'public/data/conditions.json');
      
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(data);
        
        // Check if it's not empty
        if (Object.keys(parsed).length > 0) {
          return parsed as PrecomputedConditions;
        }
      }
    } catch (e) {
      console.warn('Failed to load precomputed conditions:', e);
    }
  }
  
  return {};
}

/**
 * Check if precomputed conditions are available and fresh.
 */
export function hasPrecomputedConditions(): boolean {
  const conditions = loadPrecomputedConditions();
  return Object.keys(conditions).length > 0;
}

/**
 * Get conditions for a specific spot from precomputed data.
 * Returns null if not available.
 */
export function getSpotConditions(spotId: string): PrecomputedConditions[string] | null {
  const conditions = loadPrecomputedConditions();
  const spot = spots.find((s) => s.id === spotId);
  const key = spot ? getConditionsDataId(spot) : spotId;
  return conditions[key] || conditions[spotId] || null;
}

/**
 * Get conditions for ALL spots from precomputed data.
 * Useful for homepage and grid pages.
 */
export function getAllSpotConditions(): PrecomputedConditions {
  return loadPrecomputedConditions();
}

/**
 * Check if conditions are stale (older than max age).
 */
export function areConditionsStale(maxAgeMinutes = 30): boolean {
  return checkConditionsStale(loadPrecomputedConditions(), maxAgeMinutes);
}

/**
 * Pure staleness check over a conditions map — resolves each spot's
 * conditionsSource alias via getConditionsDataId, same as getSpotConditions.
 */
export function checkConditionsStale(
  conditions: PrecomputedConditions,
  maxAgeMinutes = 30,
  now = Date.now(),
): boolean {
  for (const spot of spots.slice(0, 3)) {
    const cond = conditions[getConditionsDataId(spot)] || conditions[spot.id];
    if (!cond?.updatedAt) return true;

    const age = now - new Date(cond.updatedAt).getTime();
    if (age > maxAgeMinutes * 60 * 1000) return true;
  }

  return false;
}
