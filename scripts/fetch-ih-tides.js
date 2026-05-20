const fs = require('fs');
const path = require('path');

const IH_API = 'https://api-features.hidrografico.pt';

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'Accept': 'application/geo+json' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseSpotsFromFile() {
  const spotsPath = path.join(__dirname, '../src/lib/spots.ts');
  const content = fs.readFileSync(spotsPath, 'utf-8');
  const spots = [];
  const spotRegex = /id:\s*['"]([^'"]+)['"][^}]*lat:\s*([0-9.\-]+)[^}]*lon:\s*([0-9.\-]+)/g;
  let match;
  while ((match = spotRegex.exec(content)) !== null) {
    spots.push({ id: match[1], lat: parseFloat(match[2]), lon: parseFloat(match[3]) });
  }
  const seen = new Set();
  return spots.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
}

async function fetchIHTides() {
  console.log('🌊 IH OGC API - Fetching tide station data...\n');

  const stationsData = await fetchJson(`${IH_API}/collections/tide_obs_stations_nrt/items?limit=50&f=json`);

  const stations = {};
  for (const feature of stationsData.features) {
    const p = feature.properties;
    if (p.last_obs != null && p.last_data) {
      stations[p.codp] = {
        codp: p.codp,
        title: p.title,
        category: p.category,
        lat: p.lat,
        lon: p.lon,
        lastObs: p.last_obs,
        lastData: p.last_data,
      };
    }
  }

  console.log(`📍 Found ${Object.keys(stations).length} active tide stations\n`);

  const spots = parseSpotsFromFile();

  const spotMapping = {};
  for (const spot of spots) {
    let nearestCodp = null;
    let nearestDist = Infinity;
    for (const [codp, station] of Object.entries(stations)) {
      const dist = haversineDistance(spot.lat, spot.lon, station.lat, station.lon);
      if (dist < nearestDist && dist < 100) {
        nearestDist = dist;
        nearestCodp = codp;
      }
    }
    if (nearestCodp) {
      spotMapping[spot.id] = {
        codp: parseInt(nearestCodp),
        stationTitle: stations[nearestCodp].title,
        distanceKm: Math.round(nearestDist * 10) / 10,
      };
    }
  }

  console.log(`🗺️  Mapped ${Object.keys(spotMapping).length} spots to nearest stations\n`);

  const outputDir = path.join(__dirname, '../public/data');
  fs.mkdirSync(outputDir, { recursive: true });

  const output = { stations, spotMapping, fetchedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(outputDir, 'ih-tides.json'), JSON.stringify(output, null, 2));

  console.log(`✅ IH tide data saved to public/data/ih-tides.json`);
  console.log(`📊 Stations: ${Object.keys(stations).length}`);
  console.log(`📊 Mapped spots: ${Object.keys(spotMapping).length}`);
}

fetchIHTides().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
