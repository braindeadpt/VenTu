/**
 * Observed-wave winner selection — IH Datawell primary, WMO/Copernicus
 * fallback — with the reason, so the UI can show both sources side by side
 * honestly (distances + freshness) instead of hiding the runner-up.
 *
 * The payloads are the ones built by observedWaveForSpot in ihBuoys.js /
 * copernicusBuoys.js (both already gated by their own freshness + distance):
 * the IH gate is stricter (3 h) than the WMO one (6 h), so when both are
 * present the IH reading is the freshest trustworthy national source.
 */

/**
 * @param {object | null} ihWave IH observedWave payload (null when stale/missing)
 * @param {object | null} wmoWave WMO/Copernicus payload
 * @param {{ nowMs?: number }} [opts]
 * @returns {{ wave: object | null, alt: object | null, meta: object | null }}
 */
/**
 * Distância máxima boia → spot (km). Auditoria de dados 16/10 (A5): boias a
 * 90–190 km (Sines → Nazaré 188 km) substituíam a onda do spot. No forecast de
 * 16/10 a diferença mediana de Hs entre dois pontos da costa é 6 % até 20 km e
 * 15 % aos 20–40 km — o erro típico do modelo que a boia corrige; mais longe,
 * a boia mede outro mar. Espelhada em `src/lib/observedWave.ts`
 * (`OBSERVED_WAVE_MAX_DISTANCE_KM`).
 */
const OBSERVED_WAVE_MAX_KM = 40;

const perto = (w, maxKm) => w && Number.isFinite(Number(w.distanceKm)) && Number(w.distanceKm) <= maxKm;
/**
 * A ponte keyless da Costa de Prata (Cabo Silleiro → Nazaré/São Martinho/
 * Baleal, `esBridgeObservedWaveForSpot`, `bridge: true`, ~280 km) é uma
 * excepção EXPLÍCITA e declarada: continua no cartão da boia, com a distância
 * real, mas fica FORA da nota: `isObservedWaveNear` (src/lib/observedWave.ts)
 * e o Dawn Patrol recusam-na pela distância.
 */
const noCartao = (w, maxKm) => perto(w, maxKm) || Boolean(w && w.bridge === true);

function selectObservedWave(ihWaveIn, wmoWaveIn, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const maxKm = opts.maxKm ?? OBSERVED_WAVE_MAX_KM;
  // Fora do raio, a leitura não é a onda deste spot: nem vencedora nem
  // alternativa (excepto a ponte declarada, que só vai ao cartão).
  const ihWave = noCartao(ihWaveIn, maxKm) ? ihWaveIn : null;
  const wmoWave = noCartao(wmoWaveIn, maxKm) ? wmoWaveIn : null;
  const ageHours = (iso) => {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return null;
    return Math.round(((nowMs - t) / 3_600_000) * 10) / 10;
  };

  const meta = (winner, reason) => ({
    winner,
    reason,
    ihAgeHours: ihWave ? ageHours(ihWave.observedAt) : null,
    wmoAgeHours: wmoWave ? ageHours(wmoWave.observedAt) : null,
    ihDistanceKm: ihWave ? Math.round(ihWave.distanceKm * 10) / 10 : null,
    wmoDistanceKm: wmoWave ? Math.round(wmoWave.distanceKm * 10) / 10 : null,
  });

  if (ihWave && wmoWave) {
    return { wave: ihWave, alt: wmoWave, meta: meta('ih', 'ih-fresh') };
  }
  if (ihWave) {
    return { wave: ihWave, alt: null, meta: meta('ih', 'ih-only') };
  }
  if (wmoWave) {
    return { wave: wmoWave, alt: null, meta: meta('wmo', 'wmo-only') };
  }
  return { wave: null, alt: null, meta: null };
}

module.exports = { selectObservedWave, OBSERVED_WAVE_MAX_KM };
