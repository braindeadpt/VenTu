'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  Wind, Waves, Thermometer, MapPin, ArrowRight, Zap, 
  ChevronDown, Filter, Star, Sunrise, TrendingUp
} from 'lucide-react';
import { spots } from '@/lib/spots';
import { fetchMarineData, getCurrentConditions } from '@/lib/openmeteo';
import { calculateSurfability, getScoreColor, estimateCrowd } from '@/lib/surfability';
import { calculateSportRating, SPORT_LABELS, SportType, getCompatibleSports } from '@/lib/sportRatings';
import { getTranslation } from '@/lib/i18n';

// ─── Types ───
interface SpotData {
  spot: typeof spots[0];
  conditions: {
    waveHeight: number;
    wavePeriod: number;
    windSpeed: number;
    windDirection: number;
    windGust: number;
    waterTemp: number;
  };
  surfability: ReturnType<typeof calculateSurfability>;
  sportRatings: Record<string, any>;
}

// ─── Sport Config ───
const SPORTS: { id: SportType | 'all'; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'all', label: 'Todos', icon: Star, color: 'text-white' },
  { id: 'surf', label: 'Surf', icon: Waves, color: 'text-cyan-400' },
  { id: 'kitesurf', label: 'Kitesurf', icon: Wind, color: 'text-sky-400' },
  { id: 'windsurf', label: 'Windsurf', icon: Wind, color: 'text-blue-400' },
  { id: 'bodyboard', label: 'Bodyboard', icon: Waves, color: 'text-teal-400' },
  { id: 'sup', label: 'SUP', icon: Waves, color: 'text-emerald-400' },
  { id: 'wakeboard', label: 'Wakeboard', icon: Zap, color: 'text-purple-400' },
];

const REGIONS = ['Todos', 'Norte', 'Centro', 'Lisboa', 'Alentejo', 'Algarve', 'Açores', 'Madeira'];

// ─── Components ───

function LiveTicker({ spotsData, locale }: { spotsData: SpotData[]; locale: string }) {
  const isPt = locale === 'pt';
  const top5 = useMemo(() => 
    [...spotsData].sort((a, b) => b.surfability.score - a.surfability.score).slice(0, 5),
    [spotsData]
  );

  return (
    <div className="w-full bg-slate-900/80 backdrop-blur-md border-b border-white/5 overflow-hidden">
      <div className="flex animate-marquee whitespace-nowrap py-2">
        {[...top5, ...top5].map((data, i) => (
          <Link
            key={`${data.spot.id}-${i}`}
            href={`/${locale}/spots/${data.spot.slug}`}
            className="inline-flex items-center gap-3 px-6 hover:bg-white/5 transition-colors"
          >
            <span className="font-bold text-white/90">{isPt ? data.spot.name : data.spot.nameEn}</span>
            <span className="flex items-center gap-1 text-xs text-white/50">
              <Waves className="w-3 h-3" />
              {data.conditions.waveHeight.toFixed(1)}m
            </span>
            <span className="flex items-center gap-1 text-xs text-white/50">
              <Wind className="w-3 h-3" />
              {(data.conditions.windSpeed * 1.94384).toFixed(0)}kt
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getScoreColor(data.surfability.score).bg} ${getScoreColor(data.surfability.score).text}`}>
              {data.surfability.score}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function HeroSection({ bestSpot, locale }: { bestSpot: SpotData; locale: string }) {
  const isPt = locale === 'pt';
  const colors = getScoreColor(bestSpot.surfability.score);
  const crowd = estimateCrowd(bestSpot.surfability.score, false, false, bestSpot.spot.difficulty);

  return (
    <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950" />
      <div className="absolute inset-0 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-500/20 via-transparent to-transparent" />
      </div>
      
      {/* Animated mesh */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 text-center space-y-8">
        {/* Score Badge */}
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${colors.bg} border ${colors.border} animate-pulse`}>
          <TrendingUp className={`w-4 h-4 ${colors.text}`} />
          <span className={`font-bold ${colors.text}`}>
            {isPt ? 'Melhor Spot Hoje' : 'Best Spot Today'}
          </span>
          <span className={`text-xl font-bold ${colors.text}`}>{bestSpot.surfability.score}/100</span>
        </div>

        {/* Spot Name */}
        <h1 className="text-5xl md:text-7xl font-black text-white tracking-tight">
          {isPt ? bestSpot.spot.name : bestSpot.spot.nameEn}
        </h1>

        {/* Tagline */}
        <p className="text-xl md:text-2xl text-white/70 max-w-2xl mx-auto">
          {isPt ? bestSpot.surfability.rating : bestSpot.surfability.ratingEn}
        </p>

        {/* Key Stats */}
        <div className="flex items-center justify-center gap-8 md:gap-12">
          <div className="text-center space-y-1">
            <Waves className="w-6 h-6 text-cyan-400 mx-auto" />
            <div className="text-2xl font-bold text-white">{bestSpot.conditions.waveHeight.toFixed(1)}m</div>
            <div className="text-xs text-white/50">{isPt ? 'Ondas' : 'Waves'}</div>
          </div>
          <div className="w-px h-12 bg-white/10" />
          <div className="text-center space-y-1">
            <Wind className="w-6 h-6 text-sky-400 mx-auto" />
            <div className="text-2xl font-bold text-white">{(bestSpot.conditions.windSpeed * 1.94384).toFixed(0)}kt</div>
            <div className="text-xs text-white/50">{isPt ? 'Vento' : 'Wind'}</div>
          </div>
          <div className="w-px h-12 bg-white/10" />
          <div className="text-center space-y-1">
            <Thermometer className="w-6 h-6 text-emerald-400 mx-auto" />
            <div className="text-2xl font-bold text-white">{bestSpot.conditions.waterTemp.toFixed(1)}°C</div>
            <div className="text-xs text-white/50">{isPt ? 'Água' : 'Water'}</div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            href={`/${locale}/spots/${bestSpot.spot.slug}`}
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white rounded-xl font-bold text-lg transition-all hover:scale-105 shadow-lg shadow-cyan-500/25"
          >
            <Zap className="w-5 h-5" />
            {isPt ? 'Ver Condições ao Vivo' : 'Live Conditions'}
          </Link>
          <Link
            href={`/${locale}/spots/`}
            className="inline-flex items-center gap-2 px-6 py-4 bg-white/5 hover:bg-white/10 text-white/80 rounded-xl font-medium transition-all border border-white/10"
          >
            {isPt ? 'Explorar todos os spots' : 'Explore all spots'}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Crowd */}
        <div className="text-sm text-white/40">
          {isPt ? `Crowd estimado: ${crowd.level}` : `Estimated crowd: ${crowd.levelEn}`}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <ChevronDown className="w-6 h-6 text-white/30" />
      </div>
    </section>
  );
}

function FilterBar({ 
  selectedSport, setSelectedSport,
  selectedRegion, setSelectedRegion,
  locale 
}: {
  selectedSport: SportType | 'all';
  setSelectedSport: (s: SportType | 'all') => void;
  selectedRegion: string;
  setSelectedRegion: (r: string) => void;
  locale: string;
}) {
  const isPt = locale === 'pt';

  return (
    <div className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-white/5 py-3">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-4 overflow-x-auto no-scrollbar">
        <Filter className="w-4 h-4 text-white/40 shrink-0" />
        
        {/* Sport filters */}
        <div className="flex items-center gap-2 shrink-0">
          {SPORTS.map((sport) => {
            const Icon = sport.icon;
            const isActive = selectedSport === sport.id;
            return (
              <button
                key={sport.id}
                onClick={() => setSelectedSport(sport.id as SportType | 'all')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                  isActive 
                    ? 'bg-white/15 text-white border border-white/20' 
                    : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? sport.color : 'text-white/40'}`} />
                {sport.label}
              </button>
            );
          })}
        </div>

        <div className="w-px h-6 bg-white/10 shrink-0" />

        {/* Region filters */}
        <div className="flex items-center gap-2 shrink-0">
          {REGIONS.map((region) => {
            const isActive = selectedRegion === region;
            return (
              <button
                key={region}
                onClick={() => setSelectedRegion(region)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                  isActive 
                    ? 'bg-white/15 text-white border border-white/20' 
                    : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
                }`}
              >
                {region === 'Todos' ? (isPt ? 'Todos' : 'All') : region}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SpotCard({ data, locale }: { data: SpotData; locale: string }) {
  const isPt = locale === 'pt';
  const colors = getScoreColor(data.surfability.score);
  const crowd = estimateCrowd(data.surfability.score, false, false, data.spot.difficulty);

  return (
    <Link
      href={`/${locale}/spots/${data.spot.slug}`}
      className="group block bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden hover:bg-white/10 hover:border-white/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/5"
    >
      {/* Image / Gradient header */}
      <div className="relative h-40 bg-gradient-to-br from-slate-700 to-slate-800 overflow-hidden">
        {data.spot.images?.[0] ? (
          <img 
            src={data.spot.images[0]} 
            alt={data.spot.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-blue-500/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
        
        {/* Score badge */}
        <div className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-bold ${colors.bg} ${colors.text} border ${colors.border}`}>
          {data.surfability.score}
        </div>

        {/* Name overlay */}
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="text-lg font-bold text-white">{isPt ? data.spot.name : data.spot.nameEn}</h3>
          <div className="flex items-center gap-1 text-sm text-white/60">
            <MapPin className="w-3 h-3" />
            {data.spot.region}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Conditions */}
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-white/60">
            <Waves className="w-4 h-4 text-cyan-400" />
            {data.conditions.waveHeight.toFixed(1)}m
          </span>
          <span className="flex items-center gap-1.5 text-white/60">
            <Wind className="w-4 h-4 text-sky-400" />
            {(data.conditions.windSpeed * 1.94384).toFixed(0)}kt
          </span>
          <span className="flex items-center gap-1.5 text-white/60">
            <Thermometer className="w-4 h-4 text-emerald-400" />
            {data.conditions.waterTemp.toFixed(0)}°C
          </span>
        </div>

        {/* Rating text */}
        <p className={`text-sm font-medium ${colors.text}`}>
          {isPt ? data.surfability.rating : data.surfability.ratingEn}
        </p>

        {/* Sports */}
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(data.sportRatings)
            .sort(([, a], [, b]) => b.rating - a.rating)
            .slice(0, 3)
            .map(([sport, rating]) => (
              <span
                key={sport}
                className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/50 border border-white/5"
                style={{ borderLeftColor: rating.color, borderLeftWidth: '2px' }}
              >
                {SPORT_LABELS[sport as SportType]?.pt || sport} {rating.rating?.toFixed(0)}
              </span>
            ))}
        </div>
      </div>
    </Link>
  );
}

function MiniMap({ locale }: { locale: string }) {
  const isPt = locale === 'pt';

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white/90">
            {isPt ? 'Mapa dos Spots' : 'Spots Map'}
          </h2>
          <p className="text-white/50 text-sm mt-1">
            {isPt ? '81 spots em Portugal, Açores e Madeira' : '81 spots in Portugal, Azores and Madeira'}
          </p>
        </div>
        <Link
          href={`/${locale}/spots/`}
          className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors text-sm font-medium"
        >
          {isPt ? 'Ver lista completa' : 'Full list'}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="relative h-[400px] rounded-2xl overflow-hidden border border-white/10 bg-slate-800/50">
        <iframe
          src={`https://www.openstreetmap.org/export/embed.html?bbox=-31.5%2C32.0%2C-6.0%2C42.5&layer=mapnik`}
          className="w-full h-full border-0 opacity-70"
          title="Map"
        />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-slate-900/50 to-transparent" />
        <div className="absolute bottom-4 left-4">
          <Link
            href={`/${locale}/spots/`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900/80 backdrop-blur-sm text-white rounded-lg text-sm font-medium border border-white/10 hover:bg-slate-800/80 transition-colors"
          >
            <MapPin className="w-4 h-4" />
            {isPt ? 'Explorar todos os spots' : 'Explore all spots'}
          </Link>
        </div>
      </div>
    </section>
  );
}

function FooterStats({ locale }: { locale: string }) {
  const isPt = locale === 'pt';

  const stats = [
    { value: '81', label: isPt ? 'spots monitorizados' : 'spots monitored', color: 'text-cyan-400' },
    { value: '6', label: isPt ? 'desportos suportados' : 'sports supported', color: 'text-sky-400' },
    { value: 'Realtime', label: 'Open-Meteo API', color: 'text-emerald-400' },
    { value: '100%', label: isPt ? 'grátis para sempre' : 'free forever', color: 'text-amber-400' },
  ];

  return (
    <section className="border-t border-white/5 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center space-y-2">
              <div className={`text-4xl md:text-5xl font-black ${stat.color}`}>{stat.value}</div>
              <div className="text-sm text-white/40">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Main Page ───

export default function HomePage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const isPt = locale === 'pt';
  const t = getTranslation(locale as any);
  
  const [spotsData, setSpotsData] = useState<SpotData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSport, setSelectedSport] = useState<SportType | 'all'>('all');
  const [selectedRegion, setSelectedRegion] = useState('Todos');

  useEffect(() => {
    async function loadData() {
      const results: SpotData[] = [];
      
      await Promise.all(
        spots.map(async (spot) => {
          try {
            const data = await fetchMarineData(spot.lat, spot.lon);
            const conditions = getCurrentConditions(data);
            const surfability = calculateSurfability(spot, {
              waveHeight: conditions.waveHeight,
              wavePeriod: conditions.wavePeriod,
              waveDirection: conditions.waveDirection,
              windSpeed: conditions.windSpeed,
              windDirection: conditions.windDirection,
              waterTemp: conditions.waterTemp,
            });
            
            const sportRatings: Record<string, any> = {};
            const compatibleSports = getCompatibleSports(
              conditions.waveHeight, conditions.windSpeed, conditions.wavePeriod
            );
            
            compatibleSports.forEach((sport: SportType) => {
              sportRatings[sport] = calculateSportRating(
                sport, conditions.waveHeight, conditions.wavePeriod,
                conditions.windSpeed, conditions.windDirection
              );
            });
            
            results.push({ spot, conditions, surfability, sportRatings });
          } catch (e) {
            console.error(`Failed to load ${spot.name}`, e);
          }
        })
      );
      
      setSpotsData(results);
      setLoading(false);
    }
    
    loadData();
  }, []);

  // Filter logic
  const filteredSpots = useMemo(() => {
    return spotsData.filter((data) => {
      const sportMatch = selectedSport === 'all' || 
        (data.sportRatings[selectedSport] && data.sportRatings[selectedSport].rating > 0);
      const regionMatch = selectedRegion === 'Todos' || data.spot.region === selectedRegion;
      return sportMatch && regionMatch;
    });
  }, [spotsData, selectedSport, selectedRegion]);

  // Best spot for hero
  const bestSpot = useMemo(() => {
    return [...spotsData].sort((a, b) => b.surfability.score - a.surfability.score)[0];
  }, [spotsData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto" />
          <p className="text-white/60 text-sm">{isPt ? 'A carregar condições...' : 'Loading conditions...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Live Ticker */}
      <LiveTicker spotsData={spotsData} locale={locale} />
      
      {/* Hero */}
      {bestSpot && <HeroSection bestSpot={bestSpot} locale={locale} />}
      
      {/* Sticky Filters */}
      <FilterBar 
        selectedSport={selectedSport} 
        setSelectedSport={setSelectedSport}
        selectedRegion={selectedRegion}
        setSelectedRegion={setSelectedRegion}
        locale={locale}
      />
      
      {/* Spots Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white/90">
              {isPt ? `Spots filtrados (${filteredSpots.length})` : `Filtered spots (${filteredSpots.length})`}
            </h2>
            <p className="text-white/50 text-sm mt-1">
              {selectedSport !== 'all' && `${SPORTS.find(s => s.id === selectedSport)?.label} • `}
              {selectedRegion !== 'Todos' && `${selectedRegion} • `}
              {isPt ? 'Ordenados por score' : 'Sorted by score'}
            </p>
          </div>
        </div>
        
        {filteredSpots.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-white/40 text-lg">
              {isPt ? 'Nenhum spot encontrado com estes filtros.' : 'No spots found with these filters.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSpots
              .sort((a, b) => b.surfability.score - a.surfability.score)
              .map((data) => (
                <SpotCard key={data.spot.id} data={data} locale={locale} />
              ))}
          </div>
        )}
      </section>
      
      {/* Mini Map */}
      <MiniMap locale={locale} />
      
      {/* Footer Stats */}
      <FooterStats locale={locale} />
    </div>
  );
}
