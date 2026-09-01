/**
 * Live probe of NEXT_PUBLIC_OBS_WORKER_URL (Cloudflare Worker).
 *
 * GET /obs?lat=41.18&lon=-8.70 must return a station (Ecowitt/IPMA/METAR).
 * GET /health is optional (older deploys 404) — warn, do not fail.
 *
 * Usage: node scripts/check-obs-worker.js
 * Env: NEXT_PUBLIC_OBS_WORKER_URL (or OBS_WORKER_URL)
 */

const {
  resolveObsWorkerBase,
  buildObsProbeUrl,
  buildHealthUrl,
  evaluateObsPayload,
} = require('./lib/obsWorkerHealth');

const BASE = resolveObsWorkerBase(
  process.env.OBS_WORKER_URL || process.env.NEXT_PUBLIC_OBS_WORKER_URL,
);

async function main() {
  const obsUrl = buildObsProbeUrl(BASE);
  console.log(`🔭 OBS worker probe: ${obsUrl}`);

  const res = await fetch(obsUrl, { cache: 'no-store' });
  if (!res.ok) {
    console.error(`❌ OBS /obs HTTP ${res.status}`);
    process.exit(1);
  }
  let body;
  try {
    body = await res.json();
  } catch (e) {
    console.error(`❌ OBS /obs is not JSON (${e.message})`);
    process.exit(1);
  }
  const evaled = evaluateObsPayload(body);
  if (!evaled.ok) {
    console.error(`❌ OBS /obs payload: ${evaled.reason}`);
    process.exit(1);
  }
  console.log(`✅ OBS /obs OK (source=${evaled.source})`);

  const healthUrl = buildHealthUrl(BASE);
  try {
    const h = await fetch(healthUrl, { cache: 'no-store' });
    if (h.ok) {
      console.log('✅ OBS /health OK');
    } else {
      console.warn(
        `::warning::OBS /health HTTP ${h.status} — deploy worker/ (GET /health) so probes stop looking like 404`,
      );
    }
  } catch (e) {
    console.warn(`::warning::OBS /health unreachable: ${e.message}`);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('❌', e.message);
    process.exit(1);
  });
}

module.exports = { main };
