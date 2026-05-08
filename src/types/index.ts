export interface Spot {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  region: string;
  regionEn: string;
  lat: number;
  lon: number;
  type: 'surf' | 'kitesurf' | 'windsurf' | 'big-wave' | 'foil' | 'multisport' | 'wakeboard';
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'all';
  bestWind: string;
  bestSwell: string;
  description: string;
  descriptionEn: string;
  images?: string[];
  facilities: string[];
  hazards: string[];
  // Water quality / beach flags (optional community data)
  waterQuality?: 'excelente' | 'boa' | 'razoavel' | 'má';
  waterQualityEn?: 'excellent' | 'good' | 'fair' | 'poor';
  blueFlag?: boolean;
  accessibleBeach?: boolean;
  goldenQuality?: boolean;
  // Crowd / secret spot info
  localSecret?: boolean;
  secretLevel?: 'known' | 'semi-secret' | 'secret' | 'deep-secret';
  // Local knowledge / tips
  localTips?: {
    bestTide?: string;
    bestTideEn?: string;
    parking?: string;
    parkingEn?: string;
    food?: string;
    foodEn?: string;
    localRule?: string;
    localRuleEn?: string;
  };
  // Secret spot exclusive info
  secretTips?: string;
  secretTipsEn?: string;
}

export interface MarineData {
  hourly: {
    time: string[];
    wave_height: number[];
    wave_direction: number[];
    wave_period: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    wind_gusts_10m: number[];
    water_temperature: number[];
  };
  daily: {
    time: string[];
    wave_height_max: number[];
    wind_speed_max: number[];
    water_temperature_max: number[];
  };
}

export interface NewsItem {
  id: string;
  title: string;
  titleEn: string;
  summary: string;
  summaryEn: string;
  category: string;
  source: string;
  url: string;
  publishedAt: string;
  image?: string;
  tags: string[];
}

export type Locale = 'pt' | 'en';
