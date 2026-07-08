/**
 * Moon phase + tidal regime (spring/neap) — pure astronomy, no API.
 * Synodic month + known new-moon epoch; spring/neap windows lag syzygy/quarter.
 */

export const SYNODIC_MONTH_DAYS = 29.530588853;

/** Reference new moon: 2000-01-06 18:14 UTC (NASA) */
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);

/** Days after syzygy/quarter when spring/neap peaks (tidal age lag). */
export const TIDE_REGIME_LAG_DAYS = 1.5;
export const TIDE_REGIME_WINDOW_DAYS = 2.5;

export type MoonPhaseName =
  | 'nova'
  | 'crescente'
  | 'quarto-crescente'
  | 'gibosa-crescente'
  | 'cheia'
  | 'gibosa-minguante'
  | 'quarto-minguante'
  | 'minguante';

export type TideRegime = 'vivas' | 'mortas' | 'transição';

export interface MoonPhaseInfo {
  /** 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter */
  phase: number;
  name: MoonPhaseName;
  /** Lit fraction of disc (0 = new, 1 = full) */
  illumination: number;
  tideRegime: TideRegime;
  /** Days since last new moon (0..synodic) */
  ageDays: number;
  waxing: boolean;
}

function normalizeAge(age: number): number {
  const s = SYNODIC_MONTH_DAYS;
  return ((age % s) + s) % s;
}

/** Age in days since last new moon for a UTC instant. */
export function getMoonAgeDays(date: Date): number {
  const diffDays = (date.getTime() - KNOWN_NEW_MOON_MS) / 86_400_000;
  return normalizeAge(diffDays);
}

export function getMoonPhaseFraction(ageDays: number): number {
  return normalizeAge(ageDays) / SYNODIC_MONTH_DAYS;
}

export function getMoonIllumination(phase: number): number {
  return (1 - Math.cos(2 * Math.PI * phase)) / 2;
}

export function getMoonPhaseName(phase: number): MoonPhaseName {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.0625 || p >= 0.9375) return 'nova';
  if (p < 0.1875) return 'crescente';
  if (p < 0.3125) return 'quarto-crescente';
  if (p < 0.4375) return 'gibosa-crescente';
  if (p < 0.5625) return 'cheia';
  if (p < 0.6875) return 'gibosa-minguante';
  if (p < 0.8125) return 'quarto-minguante';
  return 'minguante';
}

function isInAfterWindow(age: number, anchor: number): boolean {
  const start = (anchor + TIDE_REGIME_LAG_DAYS) % SYNODIC_MONTH_DAYS;
  const end = start + TIDE_REGIME_WINDOW_DAYS;
  if (end <= SYNODIC_MONTH_DAYS) {
    return age > start && age <= end;
  }
  return age > start || age <= end - SYNODIC_MONTH_DAYS;
}

export function getTideRegime(ageDays: number): TideRegime {
  const age = normalizeAge(ageDays);
  const half = SYNODIC_MONTH_DAYS / 2;
  const q1 = SYNODIC_MONTH_DAYS / 4;
  const q3 = (3 * SYNODIC_MONTH_DAYS) / 4;

  if (isInAfterWindow(age, 0) || isInAfterWindow(age, half)) {
    return 'vivas';
  }
  if (isInAfterWindow(age, q1) || isInAfterWindow(age, q3)) {
    return 'mortas';
  }
  return 'transição';
}

export function getMoonPhase(date: Date = new Date()): MoonPhaseInfo {
  const ageDays = getMoonAgeDays(date);
  const phase = getMoonPhaseFraction(ageDays);
  const illumination = getMoonIllumination(phase);
  const waxing = phase < 0.5;

  return {
    phase,
    name: getMoonPhaseName(phase),
    illumination,
    tideRegime: getTideRegime(ageDays),
    ageDays,
    waxing,
  };
}

/** Regime windows for a calendar month (Lisbon dates) — for sazonalidade strip. */
export function getTideRegimeForLisbonDay(year: number, month: number, day: number): TideRegime {
  const noon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return getTideRegime(getMoonAgeDays(noon));
}

export function getMoonPhaseLabels(locale: 'pt' | 'en'): Record<MoonPhaseName, string> {
  if (locale === 'pt') {
    return {
      nova: 'Lua nova',
      crescente: 'Lua crescente',
      'quarto-crescente': 'Quarto crescente',
      'gibosa-crescente': 'Gibosa crescente',
      cheia: 'Lua cheia',
      'gibosa-minguante': 'Gibosa minguante',
      'quarto-minguante': 'Quarto minguante',
      minguante: 'Lua minguante',
    };
  }
  return {
    nova: 'New moon',
    crescente: 'Waxing crescent',
    'quarto-crescente': 'First quarter',
    'gibosa-crescente': 'Waxing gibbous',
    cheia: 'Full moon',
    'gibosa-minguante': 'Waning gibbous',
    'quarto-minguante': 'Last quarter',
    minguante: 'Waning crescent',
  };
}

export function getTideRegimeLabels(locale: 'pt' | 'en'): Record<TideRegime, string> {
  if (locale === 'pt') {
    return {
      vivas: 'Marés vivas',
      mortas: 'Marés mortas',
      'transição': 'Transição',
    };
  }
  return {
    vivas: 'Spring tides',
    mortas: 'Neap tides',
    'transição': 'Transition',
  };
}

export function getTideRegimeMeaning(regime: TideRegime, locale: 'pt' | 'en'): string {
  if (locale === 'pt') {
    if (regime === 'vivas') {
      return 'Amplitude maior — baixa-mar expõe mais fundo; correntes mais fortes.';
    }
    if (regime === 'mortas') {
      return 'Amplitude menor — marés estáveis; menos exposição do fundo.';
    }
    return 'Entre vivas e mortas — condições intermédias.';
  }
  if (regime === 'vivas') {
    return 'Larger range — low tide exposes more bottom; stronger currents.';
  }
  if (regime === 'mortas') {
    return 'Smaller range — steadier tides; less bottom exposure.';
  }
  return 'Between spring and neap — intermediate conditions.';
}
