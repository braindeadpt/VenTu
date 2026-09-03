/**
 * Preferência do trilho de scores 48 h no mapa (como ventu.radar.state).
 * `{ enabled, paused, frame }` — `frame` é o índice no array `times`.
 */
export const MAP_HOURS_STATE_LS_KEY = 'ventu.map.hours';

export interface MapHoursStatePref {
  enabled?: boolean;
  paused: boolean;
  frame: number;
}

function readRaw(): Partial<MapHoursStatePref> | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(MAP_HOURS_STATE_LS_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as Partial<MapHoursStatePref>;
  } catch {
    return null;
  }
}

function sanitizeFrame(frame: unknown): number {
  const f = Number(frame);
  return Number.isFinite(f) && f >= 0 ? Math.floor(f) : 0;
}

export function readMapHoursPref(): MapHoursStatePref {
  const parsed = readRaw();
  if (!parsed) return { enabled: undefined, paused: false, frame: 0 };
  return {
    enabled: parsed.enabled,
    paused: parsed.paused === true,
    frame: sanitizeFrame(parsed.frame),
  };
}

export function readMapHoursEnabledPref(): boolean | undefined {
  return readRaw()?.enabled;
}

export function writeMapHoursEnabledPref(enabled: boolean) {
  if (typeof window === 'undefined') return;
  const parsed = readRaw();
  try {
    localStorage.setItem(
      MAP_HOURS_STATE_LS_KEY,
      JSON.stringify({
        enabled,
        paused: parsed?.paused === true,
        frame: sanitizeFrame(parsed?.frame),
      }),
    );
  } catch {
    /* noop */
  }
}

export function writeMapHoursPref(paused: boolean, frame: number) {
  if (typeof window === 'undefined') return;
  const parsed = readRaw();
  try {
    localStorage.setItem(
      MAP_HOURS_STATE_LS_KEY,
      JSON.stringify({
        enabled: parsed?.enabled,
        paused,
        frame: Math.max(0, Math.floor(frame)),
      }),
    );
  } catch {
    /* noop */
  }
}

export function resetMapHoursPref() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(MAP_HOURS_STATE_LS_KEY);
  } catch {
    /* noop */
  }
}
