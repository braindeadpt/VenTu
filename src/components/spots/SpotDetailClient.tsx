'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  Wind, Waves, Thermometer, MapPin, ArrowLeft, Star, 
  Zap, Sunrise
} from 'lucide-react';
import { Spot } from '@/types';
import { fetchMarineData, getCurrentConditions, getForecastData } from '@/lib/openmeteo';
import { getAllSportScores, getScoreColor, getRelevantSports } from '@/lib/sportScore';
import type { SportType } from '@/lib/sportRatings';
import SpotMap from '@/components/spots/SpotMap';
import SpotChat from '@/components/spots/SpotChat';
import FavoriteButton from '@/components/FavoriteButton';

// ─── Types ───
interface Conditions {
  waveHeight: number;
  wavePeriod: number;
  waveDirection: number;
  windSpeed: number;
  windDirection: number;
  windGust: number;
  waterTemp: number;
}

interface SpotData {
  spot: Spot;
  conditions: Conditions;
  allScores: Record<SportType, ReturnType<typeof getAllSportScores> extends Record<SportType, infer V> ? V : never>;
  forecast: any[];
}

const SPORTS: { id: SportType; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'surf', label: 'Surf', icon: Waves, color: 'text-cyan-400' },
  { id: 'kitesurf', label: 'Kitesurf', icon: Wind, color: 'text-sky-400' },
  { id: 'windsurf', label: 'Windsurf', icon: Wind, color: 'text-blue-400' },
  { id: 'bodyboard', label: 'Bodyboard', icon: Waves, color: 'text-teal-400' },
  { id: 'sup', label: 'SUP', icon: Waves, color: 'text-emerald-400' },
  { id: 'wakeboard', label: 'Wakeboard', icon: Zap, color: 'text-purple-400' },
];

// ─── Components ───

function SportSelector({ 
  selected, 
  onSelect, 
  relevantSports,
}: { 
  selected: SportType; 
  onSelect: (s: SportType) => void;
  relevantSports: SportType[];
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
      {SPORTS.map((sport) => {
        const Icon = sport.icon;
        const isActive = selected === sport.id;
        const isRelevant = relevantSports.includes(sport.id);
        
        return (
          <button
            key={sport.id}
            onClick={() => isRelevant && onSelect(sport.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
              isActive 
                ? 'bg-white/15 text-white border border-white/20' 
                : isRelevant
                  ? 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
                  : 'bg-white/[0.02] text-white/30 border border-white/5 cursor-not-allowed'
            }`}
            disabled={!isRelevant}
          >
            <Icon className={`w-4 h-4 ${isActive ? sport.color : 'text-white/40'}`} />
            {sport.label}
          </button>
        );
      })}
    </div>
  );
}

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  subtext, 
  color 
}: { 
  icon: React.ElementType; 
  label: string; 
  value: string; 
  subtext?: string;
  color: string;
}) {
  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 text-center">
      <Icon className={`w-6 h-6 ${color} mx-auto mb-2`} />
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-white/50">{label}</div>
      {subtext && <div className="text-xs text-white/30 mt-1">{subtext}</div>}
    </div>
  );
}

function ForecastMini({ data, sport, locale }: { data: any[]; sport: SportType; locale: string }) {
  const isPt = locale === 'pt';
  
  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white/70 mb-3">
        {isPt ? 'Próximas 24h' : 'Next 24h'}
      </h3>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {data.slice(0, 8).map((item, i) => (
          <div key={i} className="flex-shrink-0 text-center p-2 rounded-lg bg-white/5 min-w-[60px]">
            <div className="text-xs text-white/40">{item.time}</div>
            <div className="text-sm font-bold text-white mt-1">
              {sport === 'kitesurf' || sport === 'windsurf' 
                ? `${(item.windSpeed * 1.94384).toFixed(0)}kt`
                : `${item.waveHeight.toFixed(1)}m`
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───

export default function SpotDetailClient({ 
  spot, 
  locale 
}: { 
  spot: Spot; 
  locale: string;
}) {
  const searchParams = useSearchParams();
  const sportFromUrl = searchParams.get('sport') as SportType | null;
  
  const isPt = locale === 'pt';
  
  const [spotData, setSpotData] = useState<SpotData | null>(null);
  const [selectedSport, setSelectedSport] = useState<SportType>(
    sportFromUrl || (spot.compatibleSports?.[0] as SportType) || 'surf'
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      // Try pre-computed conditions first (1 request vs live API)
      try {
        const response = await fetch('/data/conditions.json', { cache: 'no-store' });
        if (response.ok) {
          const precomputed = await response.json();
          const cond = precomputed[spot.id];
          
          if (cond) {
            const conditions = {
              waveHeight: cond.waveHeight || 0,
              wavePeriod: cond.wavePeriod || 0,
              waveDirection: cond.waveDirection || 0,
              windSpeed: cond.windSpeed || 0,
              windDirection: cond.windDirection || 0,
              windGust: cond.windGust || 0,
              waterTemp: cond.waterTemp || 0,
            };
            const allScores = getAllSportScores(spot, conditions);
            
            // Forecast still needs live fetch (not in precomputed)
            let forecast: any[] = [];
            try {
              const marineData = await fetchMarineData(spot.lat, spot.lon);
              forecast = getForecastData(marineData).slice(0, 24);
            } catch {
              // Forecast not critical — skip if live fetch fails
            }
            
            setSpotData({ spot, conditions, allScores, forecast });
            
            if (sportFromUrl && allScores[sportFromUrl]?.score > 0) {
              setSelectedSport(sportFromUrl);
            } else {
              const bestSport = (Object.entries(allScores) as [SportType, any][])
                .sort(([, a], [, b]) => b.score - a.score)[0]?.[0];
              if (bestSport) setSelectedSport(bestSport);
            }
            setLoading(false);
            return; // Success! Skip live fetch
          }
        }
      } catch (e) {
        console.warn('Precomputed conditions not available, falling back to live fetch');
      }
      
      // Fallback: live fetch
      try {
        const marineData = await fetchMarineData(spot.lat, spot.lon);
        const conditions = getCurrentConditions(marineData);
        const allScores = getAllSportScores(spot, conditions);
        const forecast = getForecastData(marineData).slice(0, 24);
        
        setSpotData({ spot, conditions, allScores, forecast });
        
        if (sportFromUrl && allScores[sportFromUrl]?.score > 0) {
          setSelectedSport(sportFromUrl);
        } else {
          const bestSport = (Object.entries(allScores) as [SportType, any][])
            .sort(([, a], [, b]) => b.score - a.score)[0]?.[0];
          if (bestSport) setSelectedSport(bestSport);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, [spot, sportFromUrl]);

  if (loading || !spotData) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400" />
      </div>
    );
  }

  const { conditions, allScores, forecast } = spotData;
  const score = allScores[selectedSport];
  const colors = getScoreColor(score.score);
  const relevantSports = getRelevantSports(spot, allScores);

  const getStatsForSport = () => {
    const windKt = (conditions.windSpeed * 1.94384).toFixed(0);
    
    switch (selectedSport) {
      case 'surf':
      case 'bodyboard':
        return [
          { icon: Waves, label: isPt ? 'Ondas' : 'Waves', value: `${conditions.waveHeight.toFixed(1)}m`, subtext: `@ ${conditions.wavePeriod.toFixed(0)}s`, color: 'text-cyan-400' },
          { icon: Wind, label: isPt ? 'Vento' : 'Wind', value: `${windKt}kt`, subtext: isPt ? 'direção' : 'direction', color: 'text-sky-400' },
          { icon: Thermometer, label: isPt ? 'Água' : 'Water', value: `${conditions.waterTemp.toFixed(1)}°C`, color: 'text-emerald-400' },
        ];
      case 'kitesurf':
      case 'windsurf':
        return [
          { icon: Wind, label: isPt ? 'Vento' : 'Wind', value: `${windKt}kt`, subtext: isPt ? 'força principal' : 'main factor', color: 'text-sky-400' },
          { icon: Waves, label: isPt ? 'Ondas' : 'Waves', value: `${conditions.waveHeight.toFixed(1)}m`, subtext: isPt ? 'para prancha' : 'for board', color: 'text-cyan-400' },
          { icon: Thermometer, label: isPt ? 'Água' : 'Water', value: `${conditions.waterTemp.toFixed(1)}°C`, color: 'text-emerald-400' },
        ];
      case 'wakeboard':
        return [
          { icon: Zap, label: isPt ? 'Cable' : 'Cable', value: score.score > 0 ? (isPt ? 'Aberto' : 'Open') : (isPt ? 'Fechado' : 'Closed'), color: 'text-purple-400' },
          { icon: Thermometer, label: isPt ? 'Água' : 'Water', value: `${conditions.waterTemp.toFixed(1)}°C`, color: 'text-emerald-400' },
          { icon: Sunrise, label: isPt ? 'Tempo' : 'Weather', value: conditions.windSpeed < 20 ? (isPt ? 'Bom' : 'Good') : (isPt ? 'Ventoso' : 'Windy'), color: 'text-amber-400' },
        ];
      case 'sup':
        return [
          { icon: Waves, label: isPt ? 'Ondas' : 'Waves', value: `${conditions.waveHeight.toFixed(1)}m`, color: 'text-cyan-400' },
          { icon: Wind, label: isPt ? 'Vento' : 'Wind', value: `${windKt}kt`, color: 'text-sky-400' },
          { icon: Thermometer, label: isPt ? 'Água' : 'Water', value: `${conditions.waterTemp.toFixed(1)}°C`, color: 'text-emerald-400' },
        ];
      default:
        return [
          { icon: Waves, label: isPt ? 'Ondas' : 'Waves', value: `${conditions.waveHeight.toFixed(1)}m`, color: 'text-cyan-400' },
          { icon: Wind, label: isPt ? 'Vento' : 'Wind', value: `${windKt}kt`, color: 'text-sky-400' },
          { icon: Thermometer, label: isPt ? 'Água' : 'Water', value: `${conditions.waterTemp.toFixed(1)}°C`, color: 'text-emerald-400' },
        ];
    }
  };

  const stats = getStatsForSport();

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      {/* Header */}
      <div className="max-w-4xl mx-auto px-4 pt-6 pb-4">
        <Link 
          href={`/${locale}/spots/`}
          className="inline-flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          {isPt ? 'Todos os spots' : 'All spots'}
        </Link>
        
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-black text-white">
              {isPt ? spot.name : spot.nameEn}
            </h1>
            <div className="flex items-center gap-2 text-white/50 mt-2">
              <MapPin className="w-4 h-4" />
              {spot.region}
              <span>•</span>
              <Star className="w-4 h-4" />
              {spot.difficulty}
            </div>
          </div>
          <FavoriteButton spotId={spot.id} spotName={spot.name} size="lg" locale={locale} />
        </div>
      </div>

      {/* Score Section */}
      <div className={`py-8 ${colors.bg} border-y ${colors.border}`}>
        <div className="max-w-4xl mx-auto px-4 text-center space-y-4">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${colors.bg} border ${colors.border}`}>
            <Zap className={`w-5 h-5 ${colors.text}`} />
            <span className={`font-bold ${colors.text}`}>
              {SPORTS.find(s => s.id === selectedSport)?.label}
            </span>
            <span className={`text-3xl font-black ${colors.text}`}>{score.score}</span>
            <span className={`text-sm ${colors.text}`}>/100</span>
          </div>
          
          <p className="text-xl text-white/80">
            {isPt ? score.rating : score.ratingEn}
          </p>
          
          <p className="text-sm text-white/50">
            {score.factors.join(' • ')}
          </p>
          
          {score.warning && (
            <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2 inline-block">
              ⚠️ {score.warning}
            </p>
          )}
        </div>
      </div>

      {/* Sport Selector */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <p className="text-xs text-white/40 mb-2">
          {isPt ? 'Escolhe o desporto:' : 'Choose your sport:'}
        </p>
        <SportSelector 
          selected={selectedSport}
          onSelect={setSelectedSport}
          relevantSports={relevantSports}
        />
      </div>

      {/* 3 Key Stats */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map((stat, i) => (
            <StatCard key={i} {...stat} />
          ))}
        </div>
      </div>

      {/* Forecast */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <ForecastMini data={forecast} sport={selectedSport} locale={locale} />
      </div>

      {/* Map */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
          <div className="h-48">
            <SpotMap lat={spot.lat} lon={spot.lon} locale={locale} />
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white/70 mb-2">
            {isPt ? 'Sobre o spot' : 'About this spot'}
          </h3>
          <p className="text-sm text-white/60 leading-relaxed">
            {isPt ? spot.description : spot.descriptionEn}
          </p>
          
          <div className="mt-4 flex flex-wrap gap-2">
            {spot.facilities.slice(0, 4).map((f, i) => (
              <span key={i} className="text-xs px-2 py-1 rounded-full bg-white/5 text-white/50">
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Chat */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <SpotChat 
          spotSlug={spot.slug} 
          spotName={isPt ? spot.name : spot.nameEn} 
          locale={locale} 
        />
      </div>
    </div>
  );
}
