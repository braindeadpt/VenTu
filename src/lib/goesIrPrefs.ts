/**
 * Preferência do utilizador para a camada de satélite IR (GOES-East):
 *  - `enabled` — liga/desliga entre visitas;
 *  - `paused`/`frame` — manter o carrossel parado no frame escolhido.
 *
 * Persistida em `ventu.goes-ir.state` — mesmo formato de radarPrefs
 * (`ventu.radar.state`) mas chave separada: as duas camadas têm cadências
 * e índices independentes.
 */
export const GOES_IR_STATE_LS_KEY = 'ventu.goes-ir.state';

export interface GoesIrStatePref {
  enabled?: boolean;
  paused: boolean;
  frame: number;
}

function readRaw(): Partial<GoesIrStatePref> | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(GOES_IR_STATE_LS_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as Partial<GoesIrStatePref>;
  } catch {
    return null;
  }
}

function sanitizeFrame(frame: unknown): number {
  const f = Number(frame);
  return Number.isFinite(f) && f >= 0 ? Math.floor(f) : 0;
}

export function readGoesIrPref(): GoesIrStatePref {
  const parsed = readRaw();
  if (!parsed) return { enabled: undefined, paused: false, frame: 0 };
  return { enabled: parsed.enabled, paused: parsed.paused === true, frame: sanitizeFrame(parsed.frame) };
}

export function readGoesIrEnabledPref(): boolean | undefined {
  return readRaw()?.enabled;
}

export function writeGoesIrEnabledPref(enabled: boolean) {
  if (typeof window === 'undefined') return;
  const parsed = readRaw();
  try {
    localStorage.setItem(
      GOES_IR_STATE_LS_KEY,
      JSON.stringify({
        enabled,
        paused: parsed?.paused === true,
        frame: sanitizeFrame(parsed?.frame),
      }),
    );
  } catch {
    /* noop — private mode / quota */
  }
}

export function writeGoesIrPref(paused: boolean, frame: number) {
  if (typeof window === 'undefined') return;
  const parsed = readRaw();
  try {
    localStorage.setItem(
      GOES_IR_STATE_LS_KEY,
      JSON.stringify({ enabled: parsed?.enabled, paused, frame: Math.max(0, Math.floor(frame)) }),
    );
  } catch {
    /* noop — private mode / quota */
  }
}
