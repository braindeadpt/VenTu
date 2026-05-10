import { readFileSync } from 'fs';
import { join } from 'path';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { 
  Wind, Waves, Thermometer, MapPin, ArrowRight, Zap, 
  ChevronDown, Filter, Star, TrendingUp
} from 'lucide-react';
import { spots } from '@/lib/spots';
import { getAllSportScores, getScoreColor } from '@/lib/sportScore';
import type { SportType } from '@/lib/sportRatings';
import { getTranslation } from '@/lib/i18n';
import { getMacroRegion, MACRO_REGIONS } from '@/lib/regions';
import { SpotGridClient } from '@/components/spots/SpotGridClient';

// Dynamic import for client component (avoids SSR issues)
const DawnPatrolBanner = dynamic(() => import('@/components/DawnPatrolBanner'), {
  ssr: false,
  loading: () => (
    <div className="w-full bg-slate-900/50 border-b border-white/5 py-3 px-4 animate-pulse">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <div className="w-5 h-5 rounded-full bg-white/10" />
        <div className="h-4 bg-white/10 rounded w-48" />
      </div>
    </div>
  ),
});

// ─── Types ───
interface SpotData {
  spot: typeof spots[0];
  conditions: {
    waveHeight: number;
    wavePeriod: number;
    waveDirection: number;
    windSpeed: number;
    windDirection: number;
    windGust: number;
    waterTemp: number;
  };
  allScores: Record<SportType, any>;
}

// ─── Load conditions at BUILD TIME (Server Component) ───
function loadConditions(): Record<string, any> {
  try {
    const filePath = join(process.cwd(), 'public', 'data', 'conditions.json');
    const data = readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.warn('Failed to load conditions.json:', e);
    return {};
  }
}

// ─── Sport Config (used only in server component) ───
const SPORTS: { id: SportType | 'all'; label: string; color: string }[] = [
  { id: 'all', label: 'Todos', color: 'text-white' },
  { id: 'surf', label: 'Surf', color: 'text-cyan-400' },
  { id: 'kitesurf', label: 'Kitesurf', color: 'text-sky-400' },
  { id: 'windsurf', label: 'Windsurf', color: 'text-blue-400' },
  { id: 'bodyboard', label: 'Bodyboard', color: 'text-teal-400' },
  { id: 'sup', label: 'SUP', color: 'text-emerald-400' },
  { id: 'wakeboard', label: 'Wakeboard', color: 'text-purple-400' },
];

// ─── Server Component ───
export default function HomePage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const isPt = locale === 'pt';
  const t = getTranslation(locale as any);

  // Load data at BUILD TIME - visible to Googlebot!
  const conditions = loadConditions();
  
  const spotsData: SpotData[] = [];
  for (const spot of spots) {
    const cond = conditions[spot.id];
    if (cond) {
      const conditionsData = {
        waveHeight: cond.waveHeight || 0,
        wavePeriod: cond.wavePeriod || 0,
        waveDirection: cond.waveDirection || 0,
        windSpeed: cond.windSpeed || 0,
        windDirection: cond.windDirection || 0,
        windGust: cond.windGust || 0,
        waterTemp: cond.waterTemp || 0,
      };
      const allScores = getAllSportScores(spot, conditionsData);
      spotsData.push({ spot, conditions: conditionsData, allScores });
    }
  }

  // Sort by surf score
  spotsData.sort((a, b) => (b.allScores['surf']?.score || 0) - (a.allScores['surf']?.score || 0));

  const bestSpot = spotsData[0];
  const top5 = spotsData.slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-950">
      {/* SEO H1 - visible to Googlebot */}
      <h1 className="sr-only">
        {isPt 
          ? `WindSpot Portugal - ${spotsData.length} spots de surf, kitesurf e windsurf com condições em tempo real`
          : `WindSpot Portugal - ${spotsData.length} surf, kitesurf and windsurf spots with real-time conditions`
        }
      </h1>

      {/* Dawn Patrol AI Advisor Banner */}
      <DawnPatrolBanner locale={locale} />

      {/* Live Ticker - Top 5 spots */}
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
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getScoreColor(data.allScores['surf']?.score || 0).bg} ${getScoreColor(data.allScores['surf']?.score || 0).text}`}>
                {data.allScores['surf']?.score || 0}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Hero Section - Best Spot */}
      {bestSpot && (
        <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950" />
          <div className="absolute inset-0 opacity-30">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-500/20 via-transparent to-transparent" />
          </div>
          
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
          </div>

          <div className="relative z-10 max-w-4xl mx-auto px-4 text-center space-y-8">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${getScoreColor(bestSpot.allScores['surf']?.score || 0).bg} border ${getScoreColor(bestSpot.allScores['surf']?.score || 0).border} animate-pulse`}>
              <TrendingUp className={`w-4 h-4 ${getScoreColor(bestSpot.allScores['surf']?.score || 0).text}`} />
              <span className={`font-bold ${getScoreColor(bestSpot.allScores['surf']?.score || 0).text}`}>
                {isPt ? 'Melhor Spot Hoje' : 'Best Spot Today'}
              </span>
              <span className={`text-xl font-bold ${getScoreColor(bestSpot.allScores['surf']?.score || 0).text}`}>{bestSpot.allScores['surf']?.score || 0}/100</span>
            </div>

            <h2 className="text-5xl md:text-7xl font-black text-white tracking-tight">
              {isPt ? bestSpot.spot.name : bestSpot.spot.nameEn}
            </h2>

            <p className="text-xl md:text-2xl text-white/70 max-w-2xl mx-auto">
              {isPt ? bestSpot.allScores['surf']?.rating : bestSpot.allScores['surf']?.ratingEn}
            </p>

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
          </div>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
            <ChevronDown className="w-6 h-6 text-white/30" />
          </div>
        </section>
      )}

      {/* Filter Bar + Spot Grid - Client Component for interactivity */}
      <SpotGridClient 
        spotsData={spotsData} 
        locale={locale}
        regions={[...MACRO_REGIONS]}
      />

      {/* Mini Map */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white/90">
              {isPt ? 'Mapa dos Spots' : 'Spots Map'}
            </h2>
            <p className="text-white/50 text-sm mt-1">
              {isPt ? `${spots.length} spots em Portugal, Açores e Madeira` : `${spots.length} spots in Portugal, Azores and Madeira`}
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

      {/* Footer Stats */}
      <section className="border-t border-white/5 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center space-y-2">
              <div className="text-4xl md:text-5xl font-black text-cyan-400">{spots.length}</div>
              <div className="text-sm text-white/40">{isPt ? 'spots monitorizados' : 'spots monitored'}</div>
            </div>
            <div className="text-center space-y-2">
              <div className="text-4xl md:text-5xl font-black text-sky-400">7</div>
              <div className="text-sm text-white/40">{isPt ? 'desportos suportados' : 'sports supported'}</div>
            </div>
            <div className="text-center space-y-2">
              <div className="text-4xl md:text-5xl font-black text-emerald-400">Realtime</div>
              <div className="text-sm text-white/40">Open-Meteo API</div>
            </div>
            <div className="text-center space-y-2">
              <div className="text-4xl md:text-5xl font-black text-amber-400">100%</div>
              <div className="text-sm text-white/40">{isPt ? 'grátis para sempre' : 'free forever'}</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
