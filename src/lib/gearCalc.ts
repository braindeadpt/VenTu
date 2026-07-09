/**
 * Gear calculators — kite size and wetsuit thickness.
 *
 * Heuristics, not physics. The kite factor (~2.2 for a twintip at
 * comfortable power) is the widely used industry rule of thumb
 * (size m² ≈ weight kg × factor ÷ wind kt); the wetsuit bands follow
 * typical manufacturer temperature charts. Every UI that renders these
 * must label them as estimates.
 */

export type KiteDiscipline = 'twintip' | 'strapless' | 'foil';

/** Power factor per discipline — a foil needs far less kite. */
export const KITE_DISCIPLINE_FACTOR: Record<KiteDiscipline, number> = {
  twintip: 2.2,
  strapless: 1.9,
  foil: 1.4,
};

/** Common production kite sizes (m²). */
export const KITE_SIZES = [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 17] as const;

export const KITE_WEIGHT_KG_MIN = 30;
export const KITE_WEIGHT_KG_MAX = 150;
export const KITE_WIND_KT_MIN = 6;
export const KITE_WIND_KT_MAX = 45;

export interface KiteWindWindow {
  fromKt: number;
  toKt: number;
}

export interface KiteRecommendation {
  /** Exact size from the formula, before snapping to production sizes. */
  idealM2: number;
  /** Nearest production size. */
  primaryM2: number;
  primaryWindow: KiteWindWindow;
  /** Adjacent production size on the other side of the ideal, if any. */
  secondaryM2: number | null;
  secondaryWindow: KiteWindWindow | null;
}

/** Wind window (kt) where a given kite size rides comfortably. */
export function kiteWindWindow(
  weightKg: number,
  sizeM2: number,
  discipline: KiteDiscipline = 'twintip',
): KiteWindWindow {
  const idealKt = (weightKg * KITE_DISCIPLINE_FACTOR[discipline]) / sizeM2;
  return {
    fromKt: Math.round(idealKt * 0.8),
    toKt: Math.round(idealKt * 1.3),
  };
}

export function recommendKite(
  weightKg: number,
  windKt: number,
  discipline: KiteDiscipline = 'twintip',
): KiteRecommendation | null {
  if (
    !Number.isFinite(weightKg) ||
    !Number.isFinite(windKt) ||
    weightKg < KITE_WEIGHT_KG_MIN ||
    weightKg > KITE_WEIGHT_KG_MAX ||
    windKt < KITE_WIND_KT_MIN ||
    windKt > KITE_WIND_KT_MAX
  ) {
    return null;
  }

  const idealM2 = (weightKg * KITE_DISCIPLINE_FACTOR[discipline]) / windKt;

  let primaryM2: number = KITE_SIZES[0];
  let bestDiff = Infinity;
  for (const size of KITE_SIZES) {
    const diff = Math.abs(size - idealM2);
    if (diff < bestDiff) {
      bestDiff = diff;
      primaryM2 = size;
    }
  }

  const idx = KITE_SIZES.indexOf(primaryM2 as (typeof KITE_SIZES)[number]);
  let secondaryM2: number | null = null;
  if (idealM2 > primaryM2 && idx < KITE_SIZES.length - 1) {
    secondaryM2 = KITE_SIZES[idx + 1];
  } else if (idealM2 < primaryM2 && idx > 0) {
    secondaryM2 = KITE_SIZES[idx - 1];
  }

  return {
    idealM2: Math.round(idealM2 * 10) / 10,
    primaryM2,
    primaryWindow: kiteWindWindow(weightKg, primaryM2, discipline),
    secondaryM2,
    secondaryWindow:
      secondaryM2 != null ? kiteWindWindow(weightKg, secondaryM2, discipline) : null,
  };
}

// ─── Wetsuit ───

export interface WetsuitRecommendation {
  /** e.g. "4/3 mm" */
  suit: { pt: string; en: string };
  boots: boolean;
  gloves: boolean;
  hood: boolean;
  note: { pt: string; en: string };
}

export const WETSUIT_TEMP_C_MIN = 4;
export const WETSUIT_TEMP_C_MAX = 30;

/**
 * Wetsuit by water temperature. `windy` (≳15 kt) shifts the comfort down —
 * wind chill matters far more on the water than air temperature.
 */
export function recommendWetsuit(
  waterTempC: number,
  windy = false,
): WetsuitRecommendation | null {
  if (
    !Number.isFinite(waterTempC) ||
    waterTempC < WETSUIT_TEMP_C_MIN ||
    waterTempC > WETSUIT_TEMP_C_MAX
  ) {
    return null;
  }

  // Wind chill: treat the water as ~1.5°C colder when it's windy.
  const t = windy ? waterTempC - 1.5 : waterTempC;

  if (t >= 23) {
    return {
      suit: { pt: 'Licra ou fato de banho', en: 'Rashguard or boardshorts' },
      boots: false,
      gloves: false,
      hood: false,
      note: {
        pt: 'Água quente — protege-te do sol, não do frio.',
        en: 'Warm water — protect yourself from the sun, not the cold.',
      },
    };
  }
  if (t >= 20) {
    return {
      suit: { pt: 'Shorty 2 mm ou top térmico', en: '2 mm shorty or thermal top' },
      boots: false,
      gloves: false,
      hood: false,
      note: {
        pt: 'Sessões longas ao fim do dia podem pedir um 3/2.',
        en: 'Long late-day sessions may call for a 3/2.',
      },
    };
  }
  if (t >= 17) {
    return {
      suit: { pt: '3/2 mm', en: '3/2 mm' },
      boots: false,
      gloves: false,
      hood: false,
      note: {
        pt: 'O clássico do verão na costa oeste portuguesa.',
        en: 'The Portuguese west coast summer classic.',
      },
    };
  }
  if (t >= 14) {
    return {
      suit: { pt: '4/3 mm', en: '4/3 mm' },
      boots: false,
      gloves: false,
      hood: false,
      note: {
        pt: 'Botas opcionais em sessões longas ou fundo de pedra.',
        en: 'Boots optional on long sessions or rocky bottoms.',
      },
    };
  }
  if (t >= 11) {
    return {
      suit: { pt: '5/4 mm', en: '5/4 mm' },
      boots: true,
      gloves: false,
      hood: true,
      note: {
        pt: 'Inverno a sério — capuz recomendado, luvas se fores friorento.',
        en: 'Proper winter — hood recommended, gloves if you run cold.',
      },
    };
  }
  if (t >= 8) {
    return {
      suit: { pt: '5/4 mm ou 6/5 mm', en: '5/4 mm or 6/5 mm' },
      boots: true,
      gloves: true,
      hood: true,
      note: {
        pt: 'Frio exigente — sessões mais curtas, aquece bem antes.',
        en: 'Demanding cold — shorter sessions, warm up well first.',
      },
    };
  }
  return {
    suit: { pt: '6/5 mm', en: '6/5 mm' },
    boots: true,
    gloves: true,
    hood: true,
    note: {
      pt: 'Água gélida — equipamento completo obrigatório.',
      en: 'Freezing water — full kit is mandatory.',
    },
  };
}
