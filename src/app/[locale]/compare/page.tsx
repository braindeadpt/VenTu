'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Trophy, MapPin, Wind, Waves, Clock, Users, ArrowLeft, Zap, Crown, Medal, Award } from 'lucide-react';
import { spots } from '@/lib/spots';
import { fetchMarineData, getCurrentConditions } from '@/lib/openmeteo';
import { calculateSurfability, estimateCrowd, getScoreColor } from '@/lib/surfability';
import Link from 'next/link';
import SpotMap from '@/components/spots/SpotMap';

interface SpotBattleData {
  spot: typeof spots[0];
  conditions: ReturnType<typeof getCurrentConditions>;
  surfability: ReturnType<typeof calculateSurfability>;
  crowd: ReturnType<typeof estimateCrowd>;
  driveTime: string;
}

function getDriveTimeFromLisbon(region: string): string {
  const times: Record<string, string> = {
    'Cascais': '30 min',
    'Lisboa': '20 min',
    'Peniche': '1h 15min',
    'Ericeira': '45 min',
    'Nazaré': '1h 30min',
    'Algarve': '2h 30min',
    'Alentejo': '1h 45min',
    'Viana do Castelo': '4h',
    'Porto': '3h',
    'Braga': '3h 30min',
    'Madeira': '1h 30min (avion)',
    'São Miguel': '2h 30min (avion)',
  };
  return times[region] || '—';
}

function getDriveTimeFromPorto(region: string): string {
  const times: Record<string, string> = {
    'Porto': '20 min',
    'Viana do Castelo': '1h',
    'Braga': '30 min',
    'Caminha': '1h 15min',
    'Peniche': '2h 30min',
    'Ericeira': '3h',
    'Lisboa': '3h 15min',
    'Cascais': '3h 30min',
    'Nazaré': '2h',
    'Algarve': '5h',
    'Madeira': '1h 30min (avion)',
  };
  return times[region] || '—';
}

function BattleContent() {
  const searchParams = useSearchParams();
  const [battleData, setBattleData] = useState<SpotBattleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [baseCity, setBaseCity] = useState<'lisbon' | 'porto'>('lisbon');

  const slugs = searchParams.get('spots')?.split(',') || [];
  const locale = searchParams.get('locale') || 'pt';
  const isPt = locale === 'pt';

  useEffect(() => {
    if (!slugs.length) {
      setLoading(false);
      return;
    }

    const selectedSpots = slugs
      .map(slug => spots.find(s => s.slug === slug))
      .filter(Boolean) as typeof spots;

    Promise.all(
      selectedSpots.map(async (spot) => {
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
          const crowd = estimateCrowd(surfability.score, false, false, spot.difficulty);
          const driveTime = baseCity === 'lisbon' 
            ? getDriveTimeFromLisbon(spot.region)
            : getDriveTimeFromPorto(spot.region);

          return {
            spot,
            conditions,
            surfability,
            crowd,
            driveTime,
          };
        } catch {
          return null;
        }
      })
    ).then(results => {
      setBattleData(results.filter(Boolean) as SpotBattleData[]);
      setLoading(false);
    });
  }, [slugs, baseCity]);

  if (loading) {
    return (
      <div className="min-h-screen bg-ocean-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto" />
          <p className="text-white/60">{isPt ? 'A carregar batalha...' : 'Loading battle...'}</p>
        </div>
      </div>
    );
  }

  if (!slugs.length || battleData.length < 2) {
    return (
      <div className="min-h-screen bg-ocean-950 flex items-center justify-center px-4">
        <div className="text-center space-y-6 max-w-md">
          <Trophy className="w-16 h-16 text-yellow-400 mx-auto" />
          <h1 className="text-3xl font-bold text-white">Spot vs Spot 🏆</h1>
          <p className="text-white/60">
            {isPt 
              ? 'Escolhe 2-3 spots para comparar. Exemplo: /compare?spots=supertubos,guincho,nazare'
              : 'Pick 2-3 spots to compare. Example: /compare?spots=supertubos,guincho,nazare'
            }
          </p>
          <div className="space-y-2 text-sm text-white/40">
            <p>{isPt ? 'Spots disponíveis:' : 'Available spots:'}</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {spots.slice(0, 10).map(s => (
                <Link
                  key={s.slug}
                  href={`/${locale}/compare?spots=${s.slug},guincho`}
                  className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-white/60 text-xs transition-colors"
                >
                  {s.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Sort by score
  const sorted = [...battleData].sort((a, b) => b.surfability.score - a.surfability.score);
  const winner = sorted[0];
  const second = sorted[1];
  const third = sorted[2];

  const rankIcons = [Crown, Medal, Award];
  const rankColors = ['text-yellow-400', 'text-slate-300', 'text-amber-600'];
  const rankBg = ['bg-yellow-500/10', 'bg-slate-500/10', 'bg-amber-500/10'];

  return (
    <div className="min-h-screen bg-ocean-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href={`/${locale}/spots/`} className="flex items-center gap-2 text-white/50 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            {isPt ? 'Voltar' : 'Back'}
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBaseCity('lisbon')}
              className={`px-3 py-1 rounded-lg text-sm ${baseCity === 'lisbon' ? 'bg-ocean-500 text-white' : 'bg-white/5 text-white/60'}`}
            >
              Lisboa
            </button>
            <button
              onClick={() => setBaseCity('porto')}
              className={`px-3 py-1 rounded-lg text-sm ${baseCity === 'porto' ? 'bg-ocean-500 text-white' : 'bg-white/5 text-white/60'}`}
            >
              Porto
            </button>
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-2">
          <Trophy className="w-12 h-12 text-yellow-400 mx-auto" />
          <h1 className="text-4xl font-bold text-white">Spot vs Spot 🏆</h1>
          <p className="text-white/60">{isPt ? 'Quem ganha hoje?' : 'Who wins today?'}</p>
        </div>

        {/* Winner banner */}
        <div className="glass-card p-6 border-2 border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Crown className="w-8 h-8 text-yellow-400" />
            <span className="text-xl font-bold text-yellow-400">{isPt ? 'VENCEDOR DO DIA' : 'WINNER OF THE DAY'}</span>
          </div>
          <Link href={`/${locale}/spots/${winner.spot.slug}`} className="block text-center hover:scale-105 transition-transform">
            <h2 className="text-3xl font-bold text-white mb-2">{isPt ? winner.spot.name : winner.spot.nameEn}</h2>
            <p className="text-white/60">{winner.surfability.recommendation}</p>
            <div className="text-5xl font-bold text-yellow-400 mt-4">{winner.surfability.score}/100</div>
          </Link>
        </div>

        {/* Battle grid */}
        <div className={`grid gap-6 ${sorted.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3'}`}>
          {sorted.map((data, i) => {
            const Icon = rankIcons[i] || Award;
            const colors = getScoreColor(data.surfability.score);
            
            return (
              <div key={data.spot.id} className={`glass-card p-6 ${i === 0 ? 'border-2 border-yellow-500/30' : ''}`}>
                {/* Rank */}
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-2 rounded-lg ${rankBg[i] || 'bg-white/5'}`}>
                    <Icon className={`w-6 h-6 ${rankColors[i] || 'text-white/40'}`} />
                  </div>
                  <div className={`text-3xl font-bold ${colors.text}`}>#{i + 1}</div>
                </div>

                <Link href={`/${locale}/spots/${data.spot.slug}`} className="block">
                  <h3 className="text-xl font-bold text-white hover:text-ocean-300 transition-colors">
                    {isPt ? data.spot.name : data.spot.nameEn}
                  </h3>
                  <p className="text-sm text-white/50">{data.spot.region}</p>
                </Link>

                {/* Score */}
                <div className="text-center my-4">
                  <div className={`text-4xl font-bold ${colors.text}`}>{data.surfability.score}</div>
                  <div className="text-xs text-white/50">/100</div>
                </div>

                {/* Stats comparison */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-white/60">
                      <Waves className="w-4 h-4 text-wave-400" />
                      {isPt ? 'Ondas' : 'Waves'}
                    </div>
                    <span className="font-bold">{data.conditions.waveHeight.toFixed(1)}m</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-white/60">
                      <Wind className="w-4 h-4 text-wind-400" />
                      {isPt ? 'Vento' : 'Wind'}
                    </div>
                    <span className="font-bold">{(data.conditions.windSpeed * 1.94384).toFixed(0)}kt</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-white/60">
                      <Clock className="w-4 h-4 text-cyan-400" />
                      {isPt ? 'Condução desde ' + (baseCity === 'lisbon' ? 'Lisboa' : 'Porto') : 'Drive from ' + (baseCity === 'lisbon' ? 'Lisbon' : 'Porto')}
                    </div>
                    <span className="font-bold text-cyan-400">{data.driveTime}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-white/60">
                      <Users className="w-4 h-4 text-ocean-400" />
                      {isPt ? 'Crowd estimado' : 'Estimated crowd'}
                    </div>
                    <span className="font-bold">{data.crowd.icon} {isPt ? data.crowd.level : data.crowd.levelEn}</span>
                  </div>
                </div>

                {/* Mini map */}
                <div className="mt-4 h-32 rounded-xl overflow-hidden">
                  <SpotMap lat={data.spot.lat} lon={data.spot.lon} locale={locale} />
                </div>

                <Link
                  href={`/${locale}/spots/${data.spot.slug}`}
                  className="mt-4 block w-full text-center py-3 bg-ocean-500 hover:bg-ocean-600 text-white rounded-xl font-medium transition-all hover:scale-105"
                >
                  <Zap className="w-4 h-4 inline mr-2" />
                  {isPt ? 'Ver Detalhes' : 'View Details'}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function SpotBattlePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-ocean-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400" />
      </div>
    }>
      <BattleContent />
    </Suspense>
  );
}
