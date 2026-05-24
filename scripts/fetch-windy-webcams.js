/**
 * Fetch Windy webcam embed URLs at build time (avoids browser CORS).
 * Output: src/data/windy-webcams.json
 *
 * Requires NEXT_PUBLIC_WINDY_API_KEY in env or .env.local.
 * Without key: keeps existing file (CI) or writes empty map.
 */
const fs = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '../src/data/windy-webcams.json');
const SPOTS_PATH = path.join(__dirname, '../src/lib/spots.ts');
const DELAY_MS = 280;

function loadApiKey() {
  if (process.env.NEXT_PUBLIC_WINDY_API_KEY) {
    return process.env.NEXT_PUBLIC_WINDY_API_KEY.trim();
  }
  const envLocal = path.join(__dirname, '../.env.local');
  if (!fs.existsSync(envLocal)) return null;
  const line = fs.readFileSync(envLocal, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('NEXT_PUBLIC_WINDY_API_KEY='));
  return line ? line.split('=').slice(1).join('=').trim() : null;
}

function parseSpotsFromFile() {
  const content = fs.readFileSync(SPOTS_PATH, 'utf8');
  const spots = [];
  const spotRegex = /id:\s*['"]([^'"]+)['"][^}]*lat:\s*([0-9.\-]+)[^}]*lon:\s*([0-9.\-]+)/g;
  let match;
  while ((match = spotRegex.exec(content)) !== null) {
    spots.push({
      id: match[1],
      lat: parseFloat(match[2]),
      lon: parseFloat(match[3]),
    });
  }
  const seen = new Set();
  return spots.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

function writeOutput(payload) {
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWebcamForCoord(lat, lon, apiKey) {
  const params = new URLSearchParams({
    nearby: `${lat},${lon},25`,
    include: 'player,location',
    limit: '3',
  });

  const res = await fetch(`https://api.windy.com/webcams/api/v3/webcams?${params}`, {
    headers: { 'x-windy-api-key': apiKey },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  for (const cam of data.webcams ?? []) {
    const playerUrl = cam.player?.live || cam.player?.day;
    if (playerUrl) {
      return {
        playerUrl,
        name: cam.location?.city || cam.location?.country || '',
      };
    }
  }
  return null;
}

async function main() {
  const apiKey = loadApiKey();

  if (!apiKey) {
    if (fs.existsSync(OUT_PATH)) {
      console.log('⚠️  NEXT_PUBLIC_WINDY_API_KEY not set — keeping existing windy-webcams.json');
      return;
    }
    writeOutput({ generatedAt: new Date().toISOString(), spots: {} });
    console.log('⚠️  NEXT_PUBLIC_WINDY_API_KEY not set — wrote empty windy-webcams.json');
    return;
  }

  const spots = parseSpotsFromFile();
  if (spots.length < 50) {
    console.error(`❌ Only ${spots.length} spots parsed — aborting`);
    process.exit(1);
  }

  console.log(`🎥 Fetching Windy webcams for ${spots.length} spots…\n`);

  const coordCache = new Map();
  let fetched = 0;
  let matched = 0;

  for (const spot of spots) {
    const coordKey = `${spot.lat},${spot.lon}`;
    if (coordCache.has(coordKey)) continue;

    try {
      const entry = await fetchWebcamForCoord(spot.lat, spot.lon, apiKey);
      coordCache.set(coordKey, entry);
      fetched += 1;
      if (entry) {
        matched += 1;
        process.stdout.write(`  ✅ ${spot.id} → ${entry.name || 'webcam'}\n`);
      }
    } catch (err) {
      coordCache.set(coordKey, null);
      fetched += 1;
      process.stdout.write(`  ⚠️  ${spot.id} — ${err.message}\n`);
    }

    await sleep(DELAY_MS);
  }

  const spotsMap = {};
  for (const spot of spots) {
    const entry = coordCache.get(`${spot.lat},${spot.lon}`);
    if (entry) spotsMap[spot.id] = entry;
  }

  writeOutput({
    generatedAt: new Date().toISOString(),
    spots: spotsMap,
  });

  console.log(`\n✅ Windy webcams: ${Object.keys(spotsMap).length}/${spots.length} spots (${fetched} API calls)`);
}

main().catch((err) => {
  console.error('❌ Windy fetch failed:', err);
  process.exit(1);
});
