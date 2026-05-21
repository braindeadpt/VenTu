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

async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      if (response.status === 429) {
        console.log(`  ⏳ Rate limited, waiting ${delay * (i + 1)}ms...`);
        await sleep(delay * (i + 1));
        continue;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(delay * (i + 1));
    }
  }
  throw new Error('Max retries exceeded');
}

async function fetchMarineData(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    hourly: 'wave_height,wave_direction,wave_period,sea_surface_temperature,sea_level_height_msl',
    timezone: 'Europe/Lisbon',
    forecast_days: '7',
  });

  const data = await fetchWithRetry(`${MARINE_API}?${params}`);
  return data;
}

async function fetchWeatherData(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    timezone: 'Europe/Lisbon',
    forecast_days: '7',
    wind_speed_unit: 'ms',
  });

  const data = await fetchWithRetry(`${WEATHER_API}?${params}`);
  return data;
}

function getTideStatus(seaLevel, seaLevelNext) {
  const threshold = 0.3;
  if (seaLevel > threshold) {
    return { status: 'high', label: 'Maré Alta' };
  } else if (seaLevel < -threshold) {
    return { status: 'low', label: 'Maré Baixa' };
  } else if (seaLevelNext !== undefined && seaLevelNext > seaLevel) {
    return { status: 'rising', label: 'Maré a Subir' };
  } else {
    return { status: 'falling', label: 'Maré a Descer' };
  }
}

function getCurrentConditions(marineData, weatherData, ihTideObs) {
  const now = new Date();
  const currentHour = now.getHours();
  
  const marineTimeIndex = Math.max(0, marineData.hourly.time.findIndex(t => new Date(t).getHours() === currentHour));
  const weatherTimeIndex = Math.max(0, weatherData.hourly.time.findIndex(t => new Date(t).getHours() === currentHour));

  const seaLevel = marineData.hourly.sea_level_height_msl?.[marineTimeIndex] || 0;
  const seaLevelNext = marineData.hourly.sea_level_height_msl?.[marineTimeIndex + 1];
  const tide = getTideStatus(seaLevel, seaLevelNext);

  const result = {
    waveHeight: marineData.hourly.wave_height[marineTimeIndex] || 0,
    wavePeriod: marineData.hourly.wave_period[marineTimeIndex] || 0,
    waveDirection: marineData.hourly.wave_direction[marineTimeIndex] || 0,
    windSpeed: weatherData.hourly.wind_speed_10m[weatherTimeIndex] || 0,
    windDirection: weatherData.hourly.wind_direction_10m[weatherTimeIndex] || 0,
    windGust: weatherData.hourly.wind_gusts_10m[weatherTimeIndex] || 0,
    waterTemp: marineData.hourly.sea_surface_temperature[marineTimeIndex] || 0,
    tideHeight: seaLevel,
    tideStatus: tide.status,
    tideLabel: tide.label,
  };

  if (ihTideObs) {
    result.tideObservedHeight = ihTideObs.lastObs;
    result.tideObservedAt = ihTideObs.lastData;
    result.tideStation = ihTideObs.stationTitle;
  }

  return result;
}

async function updateConditions() {
  console.log('🌊 VenTu - Updating conditions...');
  const allConditions = {};
  const allForecasts = {};

  // Load IH tide station data (if available)
  let ihTides = { stations: {}, spotMapping: {} };
  const ihTidesPath = path.join(__dirname, '../public/data/ih-tides.json');
  if (fs.existsSync(ihTidesPath)) {
    try {
      ihTides = JSON.parse(fs.readFileSync(ihTidesPath, 'utf-8'));
      console.log(`📡 IH tide data loaded (${Object.keys(ihTides.stations).length} stations, ${Object.keys(ihTides.spotMapping).length} spot mappings)\n`);
    } catch (e) {
      console.warn('⚠️ Could not parse ih-tides.json, continuing without IH tide data\n');
    }
  }

  for (const spot of spots) {
    try {
      console.log(`  Fetching ${spot.id}...`);
      
      // Fetch both APIs in parallel
      const [marineData, weatherData] = await Promise.all([
        fetchMarineData(spot.lat, spot.lon),
        fetchWeatherData(spot.lat, spot.lon),
      ]);
      
      // Check if we have IH tide data for this spot
      const spotMapping = ihTides.spotMapping[spot.id];
      let ihTideObs = null;
      if (spotMapping) {
        const station = ihTides.stations[spotMapping.codp];
        if (station) {
          ihTideObs = {
            lastObs: station.lastObs,
            lastData: station.lastData,
            stationTitle: station.title,
          };
        }
      }
      
      allConditions[spot.id] = {
        ...getCurrentConditions(marineData, weatherData, ihTideObs),
        updatedAt: new Date().toISOString(),
      };

      // Store full hourly forecast for spot detail page
      const mergedForecast = [];
      const maxHours = Math.min(marineData.hourly.time.length, weatherData.hourly.time.length, 168);
      for (let i = 0; i < maxHours; i++) {
        mergedForecast.push({
          time: marineData.hourly.time[i],
          waveHeight: marineData.hourly.wave_height[i] || 0,
          wavePeriod: marineData.hourly.wave_period[i] || 0,
          waveDirection: marineData.hourly.wave_direction[i] || 0,
          windSpeed: weatherData.hourly.wind_speed_10m[i] || 0,
          windDirection: weatherData.hourly.wind_direction_10m[i] || 0,
          windGust: weatherData.hourly.wind_gusts_10m[i] || 0,
          waterTemp: marineData.hourly.sea_surface_temperature[i] || 0,
          tideHeight: marineData.hourly.sea_level_height_msl[i] || 0,
        });
      }
      allForecasts[spot.id] = mergedForecast;
      
      console.log(`  ✓ ${spot.id} updated${ihTideObs ? ` (IH tide: ${ihTideObs.lastObs}m)` : ''}`);
      
      // Rate limiting: wait 250ms between spots to avoid Open-Meteo limits
      // Open-Meteo free tier: ~10,000 calls/day, but burst limiting applies
      await sleep(250);
    } catch (error) {
      console.error(`  ✗ ${spot.id} failed:`, error.message);
    }
  }

  const outputPath = path.join(__dirname, '../public/data/conditions.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  
  // Validate we have data before writing
  const spotCount = Object.keys(allConditions).length;
  if (spotCount === 0) {
    console.error('\n❌ ERROR: No conditions fetched! Not writing empty file.');
    process.exit(1);
  }
  
  // Backup existing file before overwriting
  const backupPath = outputPath + '.backup';
  if (fs.existsSync(outputPath)) {
    fs.copyFileSync(outputPath, backupPath);
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(allConditions, null, 2));

  // Write hourly forecasts for spot detail pages
  const forecastsPath = path.join(__dirname, '../public/data/forecasts.json');
  fs.writeFileSync(forecastsPath, JSON.stringify(allForecasts));

  console.log(`\n✅ Conditions saved to ${outputPath}`);
  console.log(`📈 Forecasts saved to ${forecastsPath}`);
  console.log(`📊 Updated ${spotCount} spots`);
}

updateConditions().catch(console.error);
