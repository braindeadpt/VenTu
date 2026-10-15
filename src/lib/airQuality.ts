/**
 * European AQI (CAMS via Open-Meteo Air Quality) — escala oficial da UE:
 * 0–20 bom · 21–40 razoável · 41–60 moderado · 61–80 fraco ·
 * 81–100 muito fraco · >100 extremo. A pipeline grava o valor da hora
 * corrente em conditions.airQualityIndex (fetch-air-quality.js).
 */

export type AqiLevel = 'good' | 'fair' | 'moderate' | 'poor' | 'veryPoor' | 'extreme';

export function europeanAqiLevel(aqi: number): AqiLevel {
  if (!Number.isFinite(aqi) || aqi < 0) return 'extreme';
  if (aqi <= 20) return 'good';
  if (aqi <= 40) return 'fair';
  if (aqi <= 60) return 'moderate';
  if (aqi <= 80) return 'poor';
  if (aqi <= 100) return 'veryPoor';
  return 'extreme';
}
