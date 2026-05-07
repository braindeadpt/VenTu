/**
 * WindSpot - Update Conditions Script
 * Fetches marine data from Open-Meteo for all spots
 */

const fs = require('fs');
const path = require('path');

const MARINE_API = 'https://marine-api.open-meteo.com/v1/marine';

const spots = [
  { id: 'nazare', lat: 39.601, lon: -9.068 },
  { id: 'supertubos', lat: 39.338, lon: -9.359 },
  { id: 'guincho', lat: 39.731, lon: -9.472 },
  { id: 'foz-arelho', lat: 39.427, lon: -9.210 },
  { id: 'arrifana', lat: 37.294, lon: -8.864 },
  { id: 'alvor', lat: 37.136, lon: -8.594 },
  { id: 'espinho', lat: 41.007, lon: -8.640 },
  { id: 'carrapateira', lat: 37.183, lon: -8.905 },
  { id: 'praia-norte', lat: 39.604, lon: -9.075 },
  { id: 'lagos', lat: 37.115, lon: -8.653 },
];

async function fetchMarineData(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    hourly: 'wave_height,wave_direction,wave_period,wind_speed_10m,wind_direction_10m,wind_gusts_10m,water_temperature',
    daily: 'wave_height_max,wind_speed_max,water_temperature_max',
    models: 'meteofrance_wave,ecmwf_wam025,gfs_wave',
    timezone: 'Europe/Lisbon',
    forecast_days: '7',
  });

  const response = await fetch(`${MARINE_API}?${params}`);
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
  return response.json();
}

function getCurrentConditions(data) {
  const now = new Date();
  const currentHour = now.getHours();
  const timeIndex = data.hourly.time.findIndex(t => new Date(t).getHours() === currentHour) || 0;

  return {
    waveHeight: data.hourly.wave_height[timeIndex] || 0,
    wavePeriod: data.hourly.wave_period[timeIndex] || 0,
    waveDirection: data.hourly.wave_direction[timeIndex] || 0,
    windSpeed: data.hourly.wind_speed_10m[timeIndex] || 0,
    windDirection: data.hourly.wind_direction_10m[timeIndex] || 0,
    windGust: data.hourly.wind_gusts_10m[timeIndex] || 0,
    waterTemp: data.hourly.water_temperature[timeIndex] || 0,
  };
}

async function updateConditions() {
  console.log('🌊 WindSpot - Updating conditions...');
  const allConditions = {};

  for (const spot of spots) {
    try {
      console.log(`  Fetching ${spot.id}...`);
      const data = await fetchMarineData(spot.lat, spot.lon);
      allConditions[spot.id] = {
        ...getCurrentConditions(data),
        updatedAt: new Date().toISOString(),
      };
      console.log(`  ✓ ${spot.id} updated`);
    } catch (error) {
      console.error(`  ✗ ${spot.id} failed:`, error.message);
    }
  }

  const outputPath = path.join(__dirname, '../public/data/conditions.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(allConditions, null, 2));

  console.log(`
✅ Conditions saved to ${outputPath}`);
  console.log(`📊 Updated ${Object.keys(allConditions).length} spots`);
}

updateConditions().catch(console.error);
