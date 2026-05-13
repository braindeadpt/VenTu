/**
 * VenTu - Update Conditions Script
 * Fetches marine + weather data from Open-Meteo for all spots
 * Marine API: waves, sea temp
 * Weather API: wind, gusts
 */

const fs = require('fs');
const path = require('path');

const MARINE_API = 'https://marine-api.open-meteo.com/v1/marine';
const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';

/**
 * Parse spots from src/lib/spots.ts automatically.
 * No more hardcoded list — add a spot to spots.ts and it gets fetched automatically.
 */
function parseSpotsFromFile() {
  const spotsPath = path.join(__dirname, '../src/lib/spots.ts');
  const content = fs.readFileSync(spotsPath, 'utf-8');

  const spots = [];
  // Match each spot block: id, lat, lon
  const spotRegex = /id:\s*['"]([^'"]+)['"][^}]*lat:\s*([0-9.\-]+)[^}]*lon:\s*([0-9.\-]+)/g;
  let match;
  while ((match = spotRegex.exec(content)) !== null) {
    spots.push({
      id: match[1],
      lat: parseFloat(match[2]),
      lon: parseFloat(match[3]),
    });
  }

  // Remove duplicates (some spots like foil variants share same coords)
  const seen = new Set();
  return spots.filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

const spots = parseSpotsFromFile();

// Safety check: ensure we parsed a reasonable number of spots
const MIN_SPOTS = 50;
if (spots.length < MIN_SPOTS) {
  console.error(`\n❌ ERROR: Only ${spots.length} spots parsed from spots.ts (expected at least ${MIN_SPOTS}).`);
  console.error('   The regex parser may have failed due to a format change in spots.ts.');
  console.error('   Please check that spots.ts still contains id/lat/lon in the expected format.\n');
  process.exit(1);
}

console.log(`📋 Parsed ${spots.length} spots from src/lib/spots.ts\n`);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchMarineData(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    hourly: 'wave_height,wave_direction,wave_period,sea_surface_temperature',
    timezone: 'Europe/Lisbon',
    forecast_days: '2',
  });

  const response = await fetch(`${MARINE_API}?${params}`);
  if (!response.ok) throw new Error(`Marine API failed: ${response.status}`);
  return response.json();
}

async function fetchWeatherData(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    timezone: 'Europe/Lisbon',
    forecast_days: '2',
    wind_speed_unit: 'ms',
  });

  const response = await fetch(`${WEATHER_API}?${params}`);
  if (!response.ok) throw new Error(`Weather API failed: ${response.status}`);
  return response.json();
}

function getCurrentConditions(marineData, weatherData) {
  const now = new Date();
  const currentHour = now.getHours();
  
  const marineTimeIndex = Math.max(0, marineData.hourly.time.findIndex(t => new Date(t).getHours() === currentHour));
  const weatherTimeIndex = Math.max(0, weatherData.hourly.time.findIndex(t => new Date(t).getHours() === currentHour));

  return {
    waveHeight: marineData.hourly.wave_height[marineTimeIndex] || 0,
    wavePeriod: marineData.hourly.wave_period[marineTimeIndex] || 0,
    waveDirection: marineData.hourly.wave_direction[marineTimeIndex] || 0,
    windSpeed: weatherData.hourly.wind_speed_10m[weatherTimeIndex] || 0,
    windDirection: weatherData.hourly.wind_direction_10m[weatherTimeIndex] || 0,
    windGust: weatherData.hourly.wind_gusts_10m[weatherTimeIndex] || 0,
    waterTemp: marineData.hourly.sea_surface_temperature[marineTimeIndex] || 0,
  };
}

async function updateConditions() {
  console.log('🌊 VenTu - Updating conditions...');
  const allConditions = {};

  for (const spot of spots) {
    try {
      console.log(`  Fetching ${spot.id}...`);
      
      // Fetch both APIs in parallel
      const [marineData, weatherData] = await Promise.all([
        fetchMarineData(spot.lat, spot.lon),
        fetchWeatherData(spot.lat, spot.lon),
      ]);
      
      allConditions[spot.id] = {
        ...getCurrentConditions(marineData, weatherData),
        updatedAt: new Date().toISOString(),
      };
      
      console.log(`  ✓ ${spot.id} updated`);
      
      // Rate limiting: wait 100ms between spots
      await sleep(100);
    } catch (error) {
      console.error(`  ✗ ${spot.id} failed:`, error.message);
    }
  }

  const outputPath = path.join(__dirname, '../public/data/conditions.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(allConditions, null, 2));

  console.log(`\n✅ Conditions saved to ${outputPath}`);
  console.log(`📊 Updated ${Object.keys(allConditions).length} spots`);
}

updateConditions().catch(console.error);
