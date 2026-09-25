/**
 * Banda ensemble P10/P50/P90 por spot-hora — o descodificador do campo `ens`
 * das linhas horárias de `forecasts.json` / `forecasts/<id>.json`.
 *
 * Contrato do array (`ENSEMBLE_FIELDS` em `scripts/lib/ensembleQuantiles.js`,
 * validado pelo pipeline em `validate-generated-data.js`):
 *   [waveP10, waveP50, waveP90, windP10, windP50, windP90, waveN, windN]
 * onda em m (2 casas), vento em m/s (1 casa), contagens de membros no fim.
 * O array existe só nas horas multi-modelo; nas horas best_match e nos runs de
 * noite a chave é omitida (o produtor não a escreve).
 *
 * Cada família é independente: uma pode ter banda e a outra não. Menos de 3
 * membros → o produtor escreve `null` nos três quantis (um «P10» interpolado
 * entre 2 pontos seria um número com cara de probabilidade e sem conteúdo) e
 * aqui a família cai para null. Nunca se inventa uma banda.
 */

/** Nº mínimo de membros para publicar uma banda — espelha o produtor. */
export const ENSEMBLE_MIN_MEMBERS = 3;

/** Índices das contagens no array (últimas duas posições). */
const COUNT_INDEX = { wave: 6, wind: 7 } as const;

export interface EnsembleFamily {
  p10: number;
  p50: number;
  p90: number;
  /** Nº de modelos que responderam a esta hora — o que diz quanto confiar. */
  n: number;
}

export interface EnsembleBand {
  wave: EnsembleFamily | null;
  wind: EnsembleFamily | null;
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function family(raw: readonly unknown[], base: number, countIndex: number): EnsembleFamily | null {
  const p10 = raw[base];
  const p50 = raw[base + 1];
  const p90 = raw[base + 2];
  const n = raw[countIndex];
  if (!finite(p10) || !finite(p50) || !finite(p90)) return null;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < ENSEMBLE_MIN_MEMBERS) return null;
  return { p10, p50, p90, n };
}

/**
 * Descodifica o `ens` de uma linha horária. Devolve null quando o campo está
 * ausente, tem um shape inesperado ou nenhuma família tem banda — os
 * consumidores simplesmente não desenham nada.
 */
export function parseEnsemble(raw: unknown): EnsembleBand | null {
  if (!Array.isArray(raw) || raw.length !== 8) return null;
  const wave = family(raw, 0, COUNT_INDEX.wave);
  const wind = family(raw, 3, COUNT_INDEX.wind);
  if (!wave && !wind) return null;
  return { wave, wind };
}
