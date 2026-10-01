/**
 * APA InfoÁgua bathing-water quality — merged into conditions as
 * `conditions.waterQuality` by the pipeline (fetch-water-quality.js →
 * water-quality.json, nearest designated bathing water ≤3 km).
 *
 * `advice`: 0 = sem análises · 1 = adequada para banhos · 2 = desaconselhada.
 * The live advice is only meaningful inside each beach's época balnear —
 * `inSeason` evaluates the window at render time so a stale artifact can
 * never show a live advice out of season.
 */

export interface WaterQualityAlert {
  namePt: string;
  nameEn: string;
  advicePt?: string | null;
  adviceEn?: string | null;
  date?: string | null;
}

export interface WaterQualityLive {
  beachId: number;
  beach: string;
  distKm: number;
  advice: 0 | 1 | 2;
  adviceTitlePt?: string | null;
  adviceTitleEn?: string | null;
  /** ISO/ms timestamp da última classificação APA. */
  adviceAt?: number | null;
  /** Motivo da desaconselhação (contaminação, obras…). */
  motive?: string | null;
  /** Timestamp ms da última análise laboratorial. */
  lastSampleAt?: number | null;
  /** Classe anual oficial: 1 Excelente · 2 Boa · 3 Aceitável · 4 Má · 0 sem. */
  annualClass?: number;
  annualClassDesc?: string | null;
  /** Janela da época balnear (ms epoch) — `inSeason` avalia no render. */
  seasonStart?: number | null;
  seasonEnd?: number | null;
  blueFlag?: boolean;
  guarded?: boolean;
  accessible?: boolean;
  alerts?: WaterQualityAlert[];
}

export function waterQualityInSeason(wq: WaterQualityLive, nowMs: number): boolean {
  if (!wq.seasonStart || !wq.seasonEnd) return false;
  return nowMs >= wq.seasonStart && nowMs <= wq.seasonEnd;
}
