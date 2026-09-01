/**
 * Preferência do utilizador para o radar IPMA:
 *  - `enabled` — liga/desliga o radar entre visitas (como o vento e o cluster);
 *  - `paused`/`frame` — manter o carrossel pausado no frame escolhido ao
 *    reabrir a página (ou ao ligar o radar de novo).
 *
 * Persistida em `ventu.radar.state` como `{ enabled?, paused, frame }` — o
 * `frame` é um índice na lista actual de frames (12 mais recentes, 5-min), por
 * isso o mesmo índice continua a apontar para um frame válido em runs
 * seguintes. `enabled` é opcional por compatibilidade: registos antigos só
 * têm `{ paused, frame }` (leitura devolve undefined → sem preferência de
 * ligar desligado persistida, o mapa usa os seus defaults).
 */
export const RADAR_STATE_LS_KEY = 'ventu.radar.state';

export interface RadarStatePref {
  enabled?: boolean;
  paused: boolean;
  frame: number;
}

function readRaw(): Partial<RadarStatePref> | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(RADAR_STATE_LS_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as Partial<RadarStatePref>;
  } catch {
    return null;
  }
}

function sanitizeFrame(frame: unknown): number {
  const f = Number(frame);
  return Number.isFinite(f) && f >= 0 ? Math.floor(f) : 0;
}

export function readRadarPref(): RadarStatePref {
  const parsed = readRaw();
  if (!parsed) return { enabled: undefined, paused: false, frame: 0 };
  return { enabled: parsed.enabled, paused: parsed.paused === true, frame: sanitizeFrame(parsed.frame) };
}

/**
 * Preferência persistida de LIGAR/DESLIGAR o radar entre visitas.
 * `undefined` = nunca gravado (mapa usa os seus defaults — no arranque
 * o radar fica off salvo deep link). `true`/`false` = o utilizador
 * ligou/desligou pelo menos uma vez.
 */
export function readRadarEnabledPref(): boolean | undefined {
  return readRaw()?.enabled;
}

/** Persiste a preferência de ligar/desligar preservando paused/frame actuais. */
export function writeRadarEnabledPref(enabled: boolean) {
  if (typeof window === 'undefined') return;
  const parsed = readRaw();
  try {
    localStorage.setItem(
      RADAR_STATE_LS_KEY,
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

export function writeRadarPref(paused: boolean, frame: number) {
  if (typeof window === 'undefined') return;
  const parsed = readRaw();
  try {
    localStorage.setItem(
      RADAR_STATE_LS_KEY,
      JSON.stringify({ enabled: parsed?.enabled, paused, frame: Math.max(0, Math.floor(frame)) }),
    );
  } catch {
    /* noop — private mode / quota */
  }
}

/**
 * Repõe a preferência do radar ao «nunca decidiu» (default): remove a key.
 * No arranque o radar fica off (salvo deep link ?radar=1) e a pausa/frame
 * voltam ao zero. Usado pelo botão de reinício do HUD — a diferença para o
 * toggle-off é semântica: `enabled: false` grava uma decisão, este apaga a
 * decisão toda (também limpa paused/frame persistidos).
 */
export function resetRadarPref() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(RADAR_STATE_LS_KEY);
  } catch {
    /* noop — private mode / quota */
  }
}
