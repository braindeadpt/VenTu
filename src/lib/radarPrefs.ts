/**
 * Preferência do utilizador para o radar IPMA: manter o carrossel pausado no
 * frame escolhido ao reabrir a página (ou ao ligar o radar de novo).
 *
 * Persistida em `ventu.radar.state` como `{ paused, frame }` — o `frame` é um
 * índice na lista actual de frames (12 mais recentes, 5-min), por isso o
 * mesmo índice continua a apontar para um frame válido em runs seguintes.
 */
export const RADAR_STATE_LS_KEY = 'ventu.radar.state';

export interface RadarStatePref {
  paused: boolean;
  frame: number;
}

const DEFAULT_PREF: RadarStatePref = { paused: false, frame: 0 };

export function readRadarPref(): RadarStatePref {
  if (typeof window === 'undefined') return { ...DEFAULT_PREF };
  try {
    const stored = localStorage.getItem(RADAR_STATE_LS_KEY);
    if (!stored) return { ...DEFAULT_PREF };
    const parsed = JSON.parse(stored) as Partial<RadarStatePref>;
    const frame = Number.isFinite(parsed.frame) && (parsed.frame ?? 0) >= 0
      ? Math.floor(parsed.frame!)
      : 0;
    return { paused: parsed.paused === true, frame };
  } catch {
    return { ...DEFAULT_PREF };
  }
}

export function writeRadarPref(paused: boolean, frame: number) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      RADAR_STATE_LS_KEY,
      JSON.stringify({ paused, frame: Math.max(0, Math.floor(frame)) }),
    );
  } catch {
    /* noop — private mode / quota */
  }
}
