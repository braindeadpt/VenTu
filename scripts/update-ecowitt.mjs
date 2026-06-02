/**
 * Fetch Ecowitt PWS + merge into conditions.json (same pick rules as full obs pipeline).
 * Skips silently when ECOWITT_* env vars are missing.
 */
import { mergeObservations } from './merge-observations.mjs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { getEcowittCredentials, fetchEcowittSnapshot } = require('./lib/ecowitt.js');

async function main() {
  if (!getEcowittCredentials()) {
    console.log('ℹ️ Ecowitt skipped — set ECOWITT_APPLICATION_KEY, ECOWITT_API_KEY, ECOWITT_MAC');
    process.exit(0);
  }

  try {
    const snapshot = await fetchEcowittSnapshot();
    console.log('📡 Ecowitt snapshot:');
    console.log(JSON.stringify(snapshot, null, 2));
  } catch (err) {
    console.error(`❌ Ecowitt API: ${err.message}`);
    process.exit(1);
  }

  const result = await mergeObservations();
  if (result.ecowittWins > 0) {
    console.log(`✅ ${result.ecowittWins} spot(s) now use source=ecowitt`);
  } else {
    console.log('ℹ️ No spots within 30 km of Ecowitt station (or IPMA was closer/fresher)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
