import { MarineData } from '@/types';

const MARINE_API = 'https://marine-api.open-meteo.com/v1/marine';

export async function fetchMarineData(lat: number, lon: number): Promise<MarineData> {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    hourly: 'wave_height,wave_direction,wave_period,wind_speed_10m,wind_direction_10m,wind_gusts_10m,water_temperature',
    daily: 'wave_height_max,wind_speed_max,water_temperature_max',
    models: 'meteofrance_wave,ecmwf_wam025,gfs_wave',
    timezone: 'Europe/Lisbon',
    forecast_days: '7',
  });

  const response = await fetch(`${MARINE_API}?${params}`, { next: { revalidate: 1800 } });
  if (!response.ok) throw new Error('Failed to fetch marine data');

  const data = await response.json();

  return {
    hourly: {
      time: data.hourly.time,
      wave_height: data.hourly.wave_height,
      wave_direction: data.hourly.wave_direction,
      wave_period: data.hourly.wave_period,
      wind_speed_10m: data.hourly.wind_speed_10m,
      wind_direction_10m: data.hourly.wind_direction_10m,
      wind_gusts_10m: data.hourly.wind_gusts_10m,
      water_temperature: data.hourly.water_temperature,
    },
    daily: {
      time: data.daily.time,
      wave_height_max: data.daily.wave_height_max,
      wind_speed_max: data.daily.wind_speed_max,
      water_temperature_max: data.daily.water_temperature_max,
    },
  };
}

export function getCurrentConditions(data: MarineData) {
  const now = new Date();
  const currentHour = now.getHours();

  const timeIndex = data.hourly.time.findIndex((t: string) => {
    const hour = new Date(t).getHours();
    return hour === currentHour;
  }) || 0;

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

export function getSportRating(spotType: string, waveHeight: number, windSpeed: number) {
  let rating = 5;
  let recommendation = 'Condições razoáveis';
  let recommendationEn = 'Fair conditions';

  switch (spotType) {
    case 'surf':
    case 'big-wave':
      if (waveHeight > 2 && windSpeed < 15) {
        rating = 9;
        recommendation = 'Excelentes condições de surf!';
        recommendationEn = 'Excellent surf conditions!';
      } else if (waveHeight > 1 && windSpeed < 20) {
        rating = 7;
        recommendation = 'Boas condições para surf';
        recommendationEn = 'Good surf conditions';
      } else if (waveHeight < 0.5) {
        rating = 2;
        recommendation = 'Ondas muito pequenas';
        recommendationEn = 'Very small waves';
      }
      break;
    case 'kitesurf':
    case 'windsurf':
      if (windSpeed > 15 && windSpeed < 30) {
        rating = 9;
        recommendation = 'Vento perfeito para kite!';
        recommendationEn = 'Perfect wind for kite!';
      } else if (windSpeed > 10) {
        rating = 6;
        recommendation = 'Vento adequado para kite';
        recommendationEn = 'Adequate wind for kite';
      } else {
        rating = 2;
        recommendation = 'Vento fraco demais';
        recommendationEn = 'Too little wind';
      }
      break;
    case 'multisport':
      if (waveHeight > 0.5 && waveHeight < 1.5 && windSpeed < 20) {
        rating = 8;
        recommendation = 'Boas condições para iniciantes';
        recommendationEn = 'Good conditions for beginners';
      }
      break;
  }

  return { rating, recommendation, recommendationEn };
}