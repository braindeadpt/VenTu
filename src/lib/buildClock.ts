/**
 * Relógio do BUILD (SSG / bake / spots-index).
 *
 * O HTML estático é pré-renderizado com «agora» = hora do build: janelas
 * (`bestWindowBuild`), hora corrente da régua, `bakedAtMs` da home (HomeV6,
 * frescura das observações) e da página do spot. No build do pixel gate os
 * dados vêm de uma fixture congelada (`scripts/overlay-visual-fixture.mjs`),
 * mas o relógio não: as baselines dependiam da hora a que o CI corria e
 * partiam quando as séries da fixture acabavam.
 *
 * `VENTU_BUILD_NOW` (ISO 8601 com fuso, ex. `2026-10-27T11:13:30Z`) congela
 * esse relógio. Só é definido nos passos de build visual do CI
 * (`ci.yml` → pixel gate, `record-visual-baselines.yml`). Sem a variável,
 * `buildNowMs()` = `Date.now()`: produção não muda.
 *
 * Valor inválido → erro (um build visual com relógio real em silêncio é
 * exactamente o que isto evita).
 */
export const BUILD_NOW_ENV = 'VENTU_BUILD_NOW';

/** ISO 8601 com data, hora e fuso explícito (Z ou ±hh:mm). */
const ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Lê o valor de `VENTU_BUILD_NOW`. `undefined`/vazio → `null` (relógio real).
 * Fora do formato ou data impossível → lança.
 */
export function parseBuildNow(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const v = raw.trim();
  if (v === '') return null;
  if (!ISO_COM_FUSO.test(v)) {
    throw new Error(`${BUILD_NOW_ENV} inválido: «${raw}» (esperado ISO 8601 com fuso, ex. 2026-10-27T11:13:30Z)`);
  }
  const ms = Date.parse(v);
  // Date.parse aceita 2026-02-30 (rola para Março): confirmar o dia.
  const [, y, m, d] = /^(\d{4})-(\d{2})-(\d{2})/.exec(v) ?? [];
  const diaOk = (() => {
    if (!Number.isFinite(ms)) return false;
    const fuso = v.endsWith('Z') ? 0 : (v.slice(-6, -5) === '-' ? -1 : 1) * (Number(v.slice(-5, -3)) * 60 + Number(v.slice(-2)));
    const local = new Date(ms + fuso * 60_000);
    return local.getUTCFullYear() === Number(y) && local.getUTCMonth() + 1 === Number(m) && local.getUTCDate() === Number(d);
  })();
  if (!diaOk) throw new Error(`${BUILD_NOW_ENV} inválido: «${raw}» (data inexistente)`);
  return ms;
}

/**
 * «Agora» do build em ms: `VENTU_BUILD_NOW` quando definido, senão `Date.now()`.
 * Usar só em código de build/servidor (páginas SSG, bake, scripts).
 */
export function buildNowMs(env: Record<string, string | undefined> = process.env): number {
  return parseBuildNow(env[BUILD_NOW_ENV]) ?? Date.now();
}
