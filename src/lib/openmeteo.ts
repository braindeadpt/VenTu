import { MarineData } from '@/types';

const MARINE_API = 'https://marine-api.open-meteo.com/v1/marine';
const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';

// In-memory cache for static builds to reduce API calls
const cache = new Map<string, { data: MarineData; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Rate limiting: track last request time
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 200; // 200ms between requests = max 5 req/sec

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface WeatherData {
  temperature: number;
  weatherCode: number;
  precipitation: number;
  cloudCover: number;
  humidity: number;
  windSpeed: number;
  isDay: boolean;
}

export interface TideInfo {
  height: number;
  status: 'high' | 'low' | 'rising' | 'falling';
  label: string;
  labelEn: string;
}

// Generate realistic mock data based on spot characteristics and season
function generateMockData(lat: number, lon: number): MarineData {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  
  // Seasonal adjustments for Portugal
  // Winter (Nov-Mar): bigger waves, stronger wind
  // Summer (Jun-Sep): smaller waves, thermal winds
  const isWinter = month >= 10 || month <= 2;
  const isSummer = month >= 5 && month <= 8;
  
  // Base values adjusted by latitude (north = more swell)
  const northFactor = lat > 39 ? 1.2 : 1.0;
  
  let baseWaveHeight = isWinter ? 1.5 : 0.8;
  let baseWindSpeed = isWinter ? 15 : 10;
  let baseWaterTemp = isSummer ? 20 : 15;
  
  if (isSummer) {
    baseWaveHeight = 0.6;
    baseWindSpeed = 12; // Nortada thermal wind
    baseWaterTemp = 19 + Math.random() * 3;
  }
  
  baseWaveHeight *= northFactor;

  const hourlyTime: string[] = [];
  const hourlyWaveHeight: number[] = [];
  const hourlyWaveDirection: number[] = [];
  const hourlyWavePeriod: number[] = [];
  const hourlyWindSpeed: number[] = [];
  const hourlyWindDirection: number[] = [];
  const hourlyWindGusts: number[] = [];
  const hourlyWaterTemp: number[] = [];
  const hourlySeaLevel: number[] = [];

  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  for (let i = 0; i < 168; i++) {
    const hourTime = new Date(startOfDay.getTime() + i * 60 * 60 * 1000);
    hourlyTime.push(hourTime.toISOString());
    
    // Add some realistic variation
    const hourOfDay = hourTime.getHours();
    const dayVariation = Math.sin((hourOfDay - 6) * Math.PI / 12) * 0.3; // wind picks up during day
    const tideVariation = Math.sin(i * Math.PI / 6.2) * 0.5; // ~12.4h tidal cycle
    
    hourlyWaveHeight.push(Math.max(0.1, baseWaveHeight + (Math.random() - 0.5) * 0.8));
    hourlyWaveDirection.push(270 + (Math.random() - 0.5) * 30); // W swell
    hourlyWavePeriod.push(8 + (Math.random() - 0.5) * 4);
    hourlyWindSpeed.push(Math.max(2, baseWindSpeed + dayVariation * 8 + (Math.random() - 0.5) * 6));
    hourlyWindDirection.push(330 + (Math.random() - 0.5) * 40); // N/NW wind
    hourlyWindGusts.push(Math.max(3, baseWindSpeed + dayVariation * 10 + (Math.random() - 0.5) * 8));
    hourlyWaterTemp.push(baseWaterTemp + (Math.random() - 0.5) * 2);
    hourlySeaLevel.push(tideVariation + (Math.random() - 0.5) * 0.1);
  }

  const dailyTime: string[] = [];
  const dailyWaveHeightMax: number[] = [];
  const dailyWindSpeedMax: number[] = [];
  const dailyWaterTempMax: number[] = [];

  for (let d = 0; d < 7; d++) {
    const dayTime = new Date(startOfDay.getTime() + d * 24 * 60 * 60 * 1000);
    dailyTime.push(dayTime.toISOString().split('T')[0]);
    
    const dayStart = d * 24;
    const dayEnd = dayStart + 24;
    dailyWaveHeightMax.push(Math.max(...hourlyWaveHeight.slice(dayStart, dayEnd)));
    dailyWindSpeedMax.push(Math.max(...hourlyWindSpeed.slice(dayStart, dayEnd)));
    dailyWaterTempMax.push(Math.max(...hourlyWaterTemp.slice(dayStart, dayEnd)));
  }

  return {
    hourly: {
      time: hourlyTime,
      wave_height: hourlyWaveHeight,
      wave_direction: hourlyWaveDirection,
      wave_period: hourlyWavePeriod,
      wind_speed_10m: hourlyWindSpeed,
      wind_direction_10m: hourlyWindDirection,
      wind_gusts_10m: hourlyWindGusts,
      water_temperature: hourlyWaterTemp,
      sea_level_height: hourlySeaLevel,
    },
    daily: {
      time: dailyTime,
      wave_height_max: dailyWaveHeightMax,
      wind_speed_max: dailyWindSpeedMax,
      water_temperature_max: dailyWaterTempMax,
    },
  };
}

export async function fetchMarineData(lat: number, lon: number): Promise<MarineData> {
  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await delay(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
  }
  lastRequestTime = Date.now();

  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    hourly: 'wave_height,wave_direction,wave_period,wind_speed_10m,wind_direction_10m,wind_gusts_10m,water_temperature,sea_level_height_msl',
    daily: 'wave_height_max,wind_speed_max,water_temperature_max',
    timezone: 'Europe/Lisbon',
    forecast_days: '7',
    wind_speed_unit: 'ms',
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(`${MARINE_API}?${params}`, {
      next: { revalidate: 1800 },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`Open-Meteo API returned ${response.status}, using mock data`);
      const mock = generateMockData(lat, lon);
      cache.set(cacheKey, { data: mock, timestamp: Date.now() });
      return mock;
    }

    const data = await response.json();

    // Validate response structure
    if (!data.hourly || !data.hourly.time || !Array.isArray(data.hourly.time)) {
      console.warn('Open-Meteo API returned invalid data structure, using mock data');
      const mock = generateMockData(lat, lon);
      cache.set(cacheKey, { data: mock, timestamp: Date.now() });
      return mock;
    }

    const result = {
      hourly: {
        time: data.hourly.time,
        wave_height: data.hourly.wave_height || [],
        wave_direction: data.hourly.wave_direction || [],
        wave_period: data.hourly.wave_period || [],
        wind_speed_10m: data.hourly.wind_speed_10m || [],
        wind_direction_10m: data.hourly.wind_direction_10m || [],
        wind_gusts_10m: data.hourly.wind_gusts_10m || [],
        water_temperature: data.hourly.water_temperature || [],
        sea_level_height: data.hourly.sea_level_height_msl || [],
      },
      daily: {
        time: data.daily?.time || [],
        wave_height_max: data.daily?.wave_height_max || [],
        wind_speed_max: data.daily?.wind_speed_max || [],
        water_temperature_max: data.daily?.water_temperature_max || [],
      },
    };
    
    cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (error) {
    console.warn(`Failed to fetch marine data for ${lat},${lon}:`, error instanceof Error ? error.message : 'Unknown error');
    const mock = generateMockData(lat, lon);
    cache.set(cacheKey, { data: mock, timestamp: Date.now() });
    return mock;
  }
}

export function getCurrentConditions(data: MarineData) {
  const now = new Date();
  const currentHour = now.getHours();

  const timeIndex = Math.max(0, data.hourly.time.findIndex((t: string) => {
    const hour = new Date(t).getHours();
    return hour === currentHour;
  }));

  return {
    waveHeight: data.hourly.wave_height[timeIndex] || 0,
    wavePeriod: data.hourly.wave_period[timeIndex] || 0,
    waveDirection: data.hourly.wave_direction[timeIndex] || 0,
    windSpeed: data.hourly.wind_speed_10m[timeIndex] || 0,
    windDirection: data.hourly.wind_direction_10m[timeIndex] || 0,
    windGust: data.hourly.wind_gusts_10m[timeIndex] || 0,
    waterTemp: data.hourly.water_temperature[timeIndex] || 0,
    seaLevelHeight: data.hourly.sea_level_height?.[timeIndex] || 0,
  };
}

export function getForecastData(data: MarineData) {
  return data.hourly.time.slice(0, 168).map((time, i) => ({
    time,
    waveHeight: data.hourly.wave_height[i] || 0,
    windSpeed: data.hourly.wind_speed_10m[i] || 0,
    windGust: data.hourly.wind_gusts_10m[i] || 0,
    waterTemp: data.hourly.water_temperature[i] || 0,
  }));
}

export function getWaveRating(height: number) {
  if (height < 0.5) return { label: 'flat', className: 'bg-surf-500/20 text-surf-300 border-surf-500/30' };
  if (height < 1.0) return { label: 'small', className: 'bg-wave-500/20 text-wave-300 border-wave-500/30' };
  if (height < 2.0) return { label: 'medium', className: 'bg-wind-500/20 text-wind-300 border-wind-500/30' };
  if (height < 4.0) return { label: 'large', className: 'bg-red-500/20 text-red-300 border-red-500/30' };
  return { label: 'huge', className: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
}

export function getWindRating(speed: number) {
  if (speed < 5) return { label: 'calm', className: 'bg-surf-500/20 text-surf-300 border-surf-500/30' };
  if (speed < 15) return { label: 'light', className: 'bg-wave-500/20 text-wave-300 border-wave-500/30' };
  if (speed < 25) return { label: 'moderate', className: 'bg-wind-500/20 text-wind-300 border-wind-500/30' };
  if (speed < 35) return { label: 'strong', className: 'bg-red-500/20 text-red-300 border-red-500/30' };
  return { label: 'extreme', className: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
}

export function getDirectionArrow(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

export function getSportRating(spotType: string, waveHeight: number, windSpeed: number, wavePeriod?: number, windDirection?: number, coastOrientation?: number) {
  let rating = 5;
  let recommendation = 'Condições razoáveis';
  let recommendationEn = 'Fair conditions';

  // Wind direction analysis using coastOrientation
  const coast = coastOrientation || 270; // Default: West coast
  const angleDiff = windDirection !== undefined ? Math.abs(windDirection - coast) : 0;
  const normalizedDiff = angleDiff > 180 ? 360 - angleDiff : angleDiff;
  const isOffshore = windDirection !== undefined && normalizedDiff > 90;
  const isOnshore = windDirection !== undefined && normalizedDiff < 45;

  switch (spotType) {
    case 'surf':
    case 'big-wave':
      if (waveHeight > 2.5 && windSpeed < 12) {
        rating = 9;
        recommendation = 'Excelentes condições de surf!';
        recommendationEn = 'Excellent surf conditions!';
      } else if (waveHeight > 1.5 && windSpeed < 15) {
        rating = 7;
        recommendation = 'Boas condições para surf';
        recommendationEn = 'Good surf conditions';
      } else if (waveHeight > 1 && windSpeed < 20) {
        rating = 5;
        recommendation = 'Condições aceitáveis, vento atrapalha um pouco';
        recommendationEn = 'Acceptable conditions, wind is a bit messy';
      } else if (waveHeight < 0.5) {
        rating = 2;
        recommendation = 'Ondas muito pequenas - não vale a pena para surf';
        recommendationEn = 'Very small waves - not worth it for surfing';
      } else if (windSpeed > 25) {
        rating = 3;
        recommendation = 'Vento muito forte - ondas desarrumadas';
        recommendationEn = 'Too windy - messy waves';
      }
      
      // Adjust for wind direction
      if (isOffshore && rating > 3) {
        rating = Math.min(10, rating + 1);
        recommendation += ' (vento offshore!)';
        recommendationEn += ' (offshore wind!)';
      } else if (isOnshore && rating > 3) {
        rating = Math.max(1, rating - 1);
        recommendation += ' (vento onshore)';
        recommendationEn += ' (onshore wind)';
      }
      break;
      
    case 'kitesurf':
      if (windSpeed > 18 && windSpeed < 28) {
        rating = 9;
        recommendation = 'Vento perfeito para kitesurf!';
        recommendationEn = 'Perfect wind for kitesurfing!';
      } else if (windSpeed > 15 && windSpeed < 30) {
        rating = 7;
        recommendation = 'Bom vento para kitesurf';
        recommendationEn = 'Good wind for kitesurfing';
      } else if (windSpeed > 12) {
        rating = 5;
        recommendation = 'Vento fraco - precisas de kite grande';
        recommendationEn = 'Light wind - you\'ll need a big kite';
      } else if (windSpeed < 8) {
        rating = 2;
        recommendation = 'Vento muito fraco para kitesurf';
        recommendationEn = 'Too little wind for kitesurfing';
      } else if (windSpeed > 35) {
        rating = 3;
        recommendation = 'Vento muito forte - perigoso para kite';
        recommendationEn = 'Too windy - dangerous for kitesurfing';
      }
      break;
      
    case 'windsurf':
      if (windSpeed > 15 && windSpeed < 25) {
        rating = 9;
        recommendation = 'Vento perfeito para windsurf!';
        recommendationEn = 'Perfect wind for windsurfing!';
      } else if (windSpeed > 12 && windSpeed < 30) {
        rating = 7;
        recommendation = 'Bom vento para windsurf';
        recommendationEn = 'Good wind for windsurfing';
      } else if (windSpeed > 10) {
        rating = 5;
        recommendation = 'Vento fraco - ideal para iniciantes';
        recommendationEn = 'Light wind - good for beginners';
      } else if (windSpeed < 8) {
        rating = 2;
        recommendation = 'Vento muito fraco para windsurf';
        recommendationEn = 'Too little wind for windsurfing';
      } else if (windSpeed > 35) {
        rating = 3;
        recommendation = 'Vento muito forte - só para experts';
        recommendationEn = 'Too windy - experts only';
      }
      break;
      
    case 'foil':
      if (windSpeed > 8 && windSpeed < 20) {
        rating = 8;
        recommendation = 'Bom vento para foil!';
        recommendationEn = 'Good wind for foiling!';
      } else if (windSpeed > 5) {
        rating = 5;
        recommendation = 'Vento fraco mas funciona para foil';
        recommendationEn = 'Light wind but works for foiling';
      } else {
        rating = 2;
        recommendation = 'Vento muito fraco para foil';
        recommendationEn = 'Too little wind for foiling';
      }
      break;
      
    case 'multisport':
      if (waveHeight > 0.5 && waveHeight < 1.5 && windSpeed < 20 && windSpeed > 8) {
        rating = 8;
        recommendation = 'Boas condições para vários desportos';
        recommendationEn = 'Good conditions for multiple sports';
      } else if (windSpeed > 15) {
        rating = 6;
        recommendation = 'Vento bom para kite/windsurf';
        recommendationEn = 'Good wind for kite/windsurf';
      } else if (waveHeight > 1) {
        rating = 6;
        recommendation = 'Ondas boas para surf';
        recommendationEn = 'Good waves for surfing';
      }
      break;
  }

  return { rating, recommendation, recommendationEn };
}

export function getWeatherDescription(code: number): { pt: string; en: string; icon: string } {
  const codes: Record<number, { pt: string; en: string; icon: string }> = {
    0: { pt: 'Céu limpo', en: 'Clear sky', icon: '☀️' },
    1: { pt: 'Céu limpo', en: 'Mainly clear', icon: '🌤️' },
    2: { pt: 'Parcialmente nublado', en: 'Partly cloudy', icon: '⛅' },
    3: { pt: 'Nublado', en: 'Overcast', icon: '☁️' },
    45: { pt: 'Nevoeiro', en: 'Fog', icon: '🌫️' },
    48: { pt: 'Nevoeiro', en: 'Depositing rime fog', icon: '🌫️' },
    51: { pt: 'Chuvisco leve', en: 'Light drizzle', icon: '🌦️' },
    53: { pt: 'Chuvisco', en: 'Moderate drizzle', icon: '🌦️' },
    55: { pt: 'Chuvisco intenso', en: 'Dense drizzle', icon: '🌧️' },
    61: { pt: 'Chuva leve', en: 'Slight rain', icon: '🌦️' },
    63: { pt: 'Chuva', en: 'Moderate rain', icon: '🌧️' },
    65: { pt: 'Chuva intensa', en: 'Heavy rain', icon: '⛈️' },
    71: { pt: 'Neve leve', en: 'Slight snow', icon: '🌨️' },
    73: { pt: 'Neve', en: 'Moderate snow', icon: '❄️' },
    75: { pt: 'Neve intensa', en: 'Heavy snow', icon: '❄️' },
    80: { pt: 'Chuva leve', en: 'Slight rain showers', icon: '🌦️' },
    81: { pt: 'Chuva', en: 'Moderate rain showers', icon: '🌧️' },
    82: { pt: 'Chuva intensa', en: 'Violent rain showers', icon: '⛈️' },
    95: { pt: 'Trovoada', en: 'Thunderstorm', icon: '⛈️' },
    96: { pt: 'Trovoada com granizo', en: 'Thunderstorm with hail', icon: '⛈️' },
    99: { pt: 'Trovoada intensa', en: 'Heavy thunderstorm', icon: '⛈️' },
  };
  return codes[code] || { pt: 'Desconhecido', en: 'Unknown', icon: '❓' };
}

export async function fetchWeatherData(lat: number, lon: number): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    current: 'temperature_2m,weather_code,precipitation,cloudcover_relative,humidity_2m,wind_speed_10m,is_day',
    timezone: 'Europe/Lisbon',
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${WEATHER_API}?${params}`, {
      next: { revalidate: 1800 },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`Weather API returned ${response.status}, using defaults`);
      return { temperature: 20, weatherCode: 0, precipitation: 0, cloudCover: 0, humidity: 60, windSpeed: 10, isDay: true };
    }

    const data = await response.json();

    if (!data.current) {
      console.warn('Weather API returned invalid data, using defaults');
      return { temperature: 20, weatherCode: 0, precipitation: 0, cloudCover: 0, humidity: 60, windSpeed: 10, isDay: true };
    }

    return {
      temperature: data.current.temperature_2m || 20,
      weatherCode: data.current.weather_code || 0,
      precipitation: data.current.precipitation || 0,
      cloudCover: data.current.cloudcover_relative || 0,
      humidity: data.current.humidity_2m || 60,
      windSpeed: data.current.wind_speed_10m || 10,
      isDay: data.current.is_day === 1,
    };
  } catch (error) {
    console.warn(`Failed to fetch weather data for ${lat},${lon}:`, error instanceof Error ? error.message : 'Unknown error');
    return { temperature: 20, weatherCode: 0, precipitation: 0, cloudCover: 0, humidity: 60, windSpeed: 10, isDay: true };
  }
}

export function getTideInfo(seaLevelHeight: number): TideInfo {
  // Open-Meteo sea_level_height_msl is relative to global mean sea level
  // Positive = above mean (closer to high tide), Negative = below mean (closer to low tide)
  
  const threshold = 0.3; // meters
  
  if (seaLevelHeight > threshold) {
    return {
      height: seaLevelHeight,
      status: 'high',
      label: 'Maré Alta',
      labelEn: 'High Tide',
    };
  } else if (seaLevelHeight < -threshold) {
    return {
      height: seaLevelHeight,
      status: 'low',
      label: 'Maré Baixa',
      labelEn: 'Low Tide',
    };
  } else if (seaLevelHeight > 0) {
    return {
      height: seaLevelHeight,
      status: 'rising',
      label: 'Maré a Subir',
      labelEn: 'Rising Tide',
    };
  } else {
    return {
      height: seaLevelHeight,
      status: 'falling',
      label: 'Maré a Descer',
      labelEn: 'Falling Tide',
    };
  }
}
