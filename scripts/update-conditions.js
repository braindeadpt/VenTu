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

const spots = [
  { id: 'matosinhos', lat: 41.177, lon: -8.692 },
  { id: 'ofir', lat: 41.548, lon: -8.789 },
  { id: 'povoa-varzim', lat: 41.377, lon: -8.760 },
  { id: 'cabedelo', lat: 41.687, lon: -8.845 },
  { id: 'esposende', lat: 41.536, lon: -8.783 },
  { id: 'moledo', lat: 41.848, lon: -8.863 },
  { id: 'afife', lat: 41.780, lon: -8.860 },
  { id: 'ancora', lat: 41.815, lon: -8.860 },
  { id: 'vila-praia-ancora', lat: 41.817, lon: -8.850 },
  { id: 'castelo-neiva', lat: 41.750, lon: -8.820 },
  { id: 'amorosa', lat: 41.700, lon: -8.850 },
  { id: 'apulia', lat: 41.480, lon: -8.760 },
  { id: 'fao', lat: 41.510, lon: -8.770 },
  { id: 'espinho', lat: 41.007, lon: -8.640 },
  { id: 'esmoriz', lat: 40.960, lon: -8.620 },
  { id: 'cortegaca', lat: 40.940, lon: -8.610 },
  { id: 'azurara', lat: 41.360, lon: -8.750 },
  { id: 'leca-palmeira', lat: 41.190, lon: -8.700 },
  { id: 'maceda', lat: 40.930, lon: -8.600 },
  { id: 'sao-jacinto', lat: 40.700, lon: -8.730 },
  { id: 'coxos', lat: 38.999, lon: -9.430 },
  { id: 'foz-lizandro', lat: 38.936, lon: -9.392 },
  { id: 'baleal', lat: 39.372, lon: -9.338 },
  { id: 'carcavelos', lat: 38.679, lon: -9.335 },
  { id: 'costa-caparica', lat: 38.645, lon: -9.236 },
  { id: 'fonte-telha', lat: 38.580, lon: -9.212 },
  { id: 'lagoa-albufeira', lat: 38.501, lon: -9.140 },
  { id: 'costa-nova', lat: 40.620, lon: -8.747 },
  { id: 'nazare', lat: 39.597, lon: -9.073 },
  { id: 'supertubos', lat: 39.338, lon: -9.359 },
  { id: 'guincho', lat: 38.733, lon: -9.473 },
  { id: 'foz-arelho', lat: 39.427, lon: -9.210 },
  { id: 'arrifana', lat: 37.294, lon: -8.864 },
  { id: 'alvor', lat: 37.136, lon: -8.594 },
  { id: 'tonel', lat: 37.010, lon: -8.945 },
  { id: 'beliche', lat: 37.030, lon: -8.970 },
  { id: 'zavial', lat: 37.005, lon: -8.925 },
  { id: 'martinhal', lat: 37.025, lon: -8.935 },
  { id: 'praia-rocha', lat: 37.139, lon: -8.535 },
  { id: 'carrapateira', lat: 37.183, lon: -8.905 },
  { id: 'praia-norte', lat: 39.604, lon: -9.075 },
  { id: 'lagos', lat: 37.115, lon: -8.653 },
  { id: 'santa-barbara', lat: 37.821, lon: -25.698 },
  { id: 'monte-verde', lat: 37.829, lon: -25.653 },
  { id: 'mosteiros', lat: 37.890, lon: -25.823 },
  { id: 'milicias', lat: 37.738, lon: -25.636 },
  { id: 'praia-vitoria', lat: 38.730, lon: -27.066 },
  { id: 'santa-catarina-terceira', lat: 38.683, lon: -27.218 },
  { id: 'almoxarife', lat: 38.533, lon: -28.633 },
  { id: 'anjos', lat: 36.967, lon: -25.100 },
  { id: 'porto-da-cruz', lat: 32.767, lon: -16.833 },
  { id: 'jardim-mar', lat: 32.750, lon: -17.217 },
  { id: 'paul-mar', lat: 32.767, lon: -17.233 },
  { id: 'ponta-sao-lourenco', lat: 32.733, lon: -16.667 },
  { id: 'funchal', lat: 32.650, lon: -16.917 },
  { id: 'ribeira-brava', lat: 32.683, lon: -17.000 },
  { id: 'sao-vicente-madeira', lat: 32.800, lon: -17.033 },
  { id: 'vila-nova-milfontes', lat: 37.723, lon: -8.783 },
  { id: 'zambujeira', lat: 37.527, lon: -8.785 },
  { id: 'porto-covo', lat: 37.852, lon: -8.790 },
  { id: 'odeceixe', lat: 37.440, lon: -8.800 },
  { id: 'sao-torpes', lat: 37.950, lon: -8.800 },
  { id: 'malhao', lat: 37.775, lon: -8.775 },
  { id: 'foil-lagoa-albufeira', lat: 38.501, lon: -9.140 },
  { id: 'foil-foz-arelho', lat: 39.427, lon: -9.210 },
  { id: 'foil-alvor', lat: 37.136, lon: -8.594 },
  { id: 'foil-cabedelo', lat: 41.687, lon: -8.845 },
  { id: 'castelo-bode', lat: 39.600, lon: -8.300 },
  { id: 'alqueva', lat: 38.200, lon: -7.500 },
  { id: 'lagos-wakepark', lat: 37.100, lon: -8.670 },
  { id: 'ponta-delgada', lat: 37.741, lon: -25.669 },
];

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
