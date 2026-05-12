'use client';

import { useState, useEffect } from 'react';
import { Trophy, MapPin, Wind, Waves, Clock, ArrowLeft, Crown, Medal, Award } from 'lucide-react';
import { spots } from '@/lib/spots';
import { fetchMarineData, getCurrentConditions } from '@/lib/openmeteo';
import { getAllSportScores, getScoreColor } from '@/lib/sportScore';
import type { SportType } from '@/lib/sportRatings';
import Link from 'next/link';

interface SpotBattleData {
  spot: typeof spots[0];
  conditions: ReturnType<typeof getCurrentConditions>;
  allScores: Record<SportType, any>;
  driveTime: string;
}

function getDriveTimeFromLisbon(region: string): string {
  const times: Record<string, string> = {
    'Cascais': '30 min', 'Lisboa': '20 min', 'Peniche': '1h 15min',
    'Ericeira': '45 min', 'Nazaré': '1h 30min', 'Algarve': '2h 30min',
    'Alentejo': '1h 45min', 'Porto': '3h', 'Braga': '3h 30min',
    'Madeira': '1h 30min (avion)', 'São Miguel': '2h 30min (avion)',
  };
  return times[region] || '—';
}

function getDriveTimeFromPorto(region: string): string {
  const times: Record<string, string> = {
    'Porto': '20 min', 'Viana do Castelo': '1h', 'Braga': '30 min',
    'Caminha': '1h 15min', 'Peniche': '2h 30min', 'Ericeira': '3h',
    'Lisboa': '3h 15min', 'Cascais': '3h 30min', 'Nazaré': '2h',
    'Algarve': '5h', 'Madeira': '1h 30min (avion)',
  };
  return times[region] || '—';
}

// Read spots from URL query string directly — avoids useSearchParams crash in static export
function getSpotsFromUrl(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const params = new URLSearchParams(window.location.search);
    const spotsParam = params.get('spots');
    return spotsParam ? spotsParam.split(',').filter(Boolean) : [];
  } catch {
    return [];
  }
}

// Read locale from pathname — avoids useParams in static export
function getLocaleFromPath(): string {
  if (typeof window === 'undefined') return 'pt';
  try {
    const match = window.location.pathname.match(/^\/(pt|en)\//);
    return match ? match[1] : 'pt';
  } catch {
    return 'pt';
  }
}

export default function CompareClient() {
  const [battleData, setBattleData] = useState<SpotBattleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSport, setSelectedSport] = useState<SportType>('surf');
  const [baseCity, setBaseCity] = useState<'lisbon' | 'porto'>('lisbon');
  const [slugs, setSlugs] = useState<string[]>([]);
  const [locale, setLocale] = useState('pt');

  // Read URL params once on mount (safe for static export)
  useEffect(() => {
    setSlugs(getSpotsFromUrl());
    setLocale(getLocaleFromPath());
  }, []);

  const isPt = locale === 'pt';

  // Fetch data for selected spots
  useEffect(() => {
    if (!slugs.length) { setLoading(false); return; }

    const selectedSpots = slugs
      .map(slug => spots.find(s => s.slug === slug))
      .filter(Boolean) as typeof spots;

    Promise.all(
      selectedSpots.map(async (spot) => {
        try {
          const data = await fetchMarineData(spot.lat, spot.lon);
          const conditions = getCurrentConditions(data);
          const allScores = getAllSportScores(spot, conditions);
          const driveTime = baseCity === 'lisbon' 
            ? getDriveTimeFromLisbon(spot.region)
            : getDriveTimeFromPorto(spot.region);

          return { spot, conditions, allScores, driveTime };
        } catch { return null; }
      })
    ).then(results => {
      setBattleData(results.filter(Boolean) as SpotBattleData[]);
      setLoading(false);
    });
  }, [slugs, baseCity]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400" />
      </div>
    );
  }

  if (!slugs.length || battleData.length < 2) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="text-center space-y-6 max-w-md">
          <Trophy className="w-16 h-16 text-yellow-400 mx-auto" />
          <h1 className="text-3xl font-bold text-white">Spot vs Spot</h1>
          <p className="text-white/60">
            {isPt 
              ? 'Escolhe 2-3 spots para comparar. Exemplo: /compare/?spots=supertubos,guincho'
              : 'Pick 2-3 spots to compare. Example: /compare/?spots=supertubos,guincho'
            }
          </p>
        </div>
      </div>
    );
  }

  const sorted = [...battleData].sort((a, b) => 
    (b.allScores[selectedSport]?.score || 0) - (a.allScores[selectedSport]?.score || 0)
  );
  const winner = sorted[0];

  const rankIcons = [Crown, Medal, Award];
  const rankColors = ['text-yellow-400', 'text-slate-300', 'text-amber-600'];

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <Link href={`/${locale}/spots/`} className="flex items-center gap-2 text-white/50 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
            {isPt ? 'Voltar' : 'Back'}
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={() => setBaseCity('lisbon')} className={`px-3 py-1 rounded-lg text-sm ${baseCity === 'lisbon' ? 'bg-cyan-500 text-white' : 'bg-white/5 text-white/60'}`}>Lisboa</button>
            <button onClick={() => setBaseCity('porto')} className={`px-3 py-1 rounded-lg text-sm ${baseCity === 'porto' ? 'bg-cyan-500 text-white' : 'bg-white/5 text-white/60'}`}>Porto</button>
          </div>
        </div>

        <div className="text-center space-y-2">
          <Trophy className="w-12 h-12 text-yellow-400 mx-auto" />
          <h1 className="text-4xl font-bold text-white">Spot vs Spot</h1>
          <p className="text-white/60">{isPt ? 'Quem ganha hoje?' : 'Who wins today?'}</p>
        </div>

        <div className="flex items-center justify-center gap-2">
          {(['surf', 'kitesurf', 'windsurf', 'bodyboard'] as SportType[]).map(sport => (
            <button
              key={sport}
              onClick={() => setSelectedSport(sport)}
              className={`px-4 py-2 rounded-full text-sm font-medium ${selectedSport === sport ? 'bg-white/15 text-white border border-white/20' : 'bg-white/5 text-white/60'}`}
            >
              {sport.charAt(0).toUpperCase() + sport.slice(1)}
            </button>
          ))}
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-yellow-500/30 rounded-2xl p-6 text-center">
          <Crown className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
          <p className="text-yellow-400 font-bold mb-2">{isPt ? 'VENCEDOR' : 'WINNER'}</p>
          <h2 className="text-3xl font-bold text-white">{isPt ? winner.spot.name : winner.spot.nameEn}</h2>
          <p className="text-white/60">{isPt ? winner.allScores[selectedSport]?.rating : winner.allScores[selectedSport]?.ratingEn}</p>
          <div className="text-5xl font-bold text-yellow-400 mt-4">{winner.allScores[selectedSport]?.score}/100</div>
        </div>

        <div className={`grid gap-6 ${sorted.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3'}`}>
          {sorted.map((data, i) => {
            const Icon = rankIcons[i] || Award;
            const colors = getScoreColor(data.allScores[selectedSport]?.score || 0);
            const score = data.allScores[selectedSport];
            
            return (
              <div key={data.spot.id} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-6 h-6 ${rankColors[i]}`} />
                    {data.conditions.source === 'mock' && (
                      <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        DEMO
                      </span>
                    )}
                  </div>
                  <span className={`text-3xl font-bold ${colors.text}`}>#{i + 1}</span>
                </div>

                <h3 className="text-xl font-bold text-white">{isPt ? data.spot.name : data.spot.nameEn}</h3>
                <p className="text-sm text-white/50">{data.spot.region}</p>

                <div className="text-center my-4">
                  <div className={`text-4xl font-bold ${colors.text}`}>{score?.score || 0}</div>
                  <div className="text-xs text-white/50">/100</div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/60 flex items-center gap-1"><Waves className="w-4 h-4"/>{isPt ? 'Ondas' : 'Waves'}</span>
                    <span className="font-bold">{data.conditions.waveHeight.toFixed(1)}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60 flex items-center gap-1"><Wind className="w-4 h-4"/>{isPt ? 'Vento' : 'Wind'}</span>
                    <span className="font-bold">{(data.conditions.windSpeed * 1.94384).toFixed(0)}kt</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60 flex items-center gap-1"><Clock className="w-4 h-4"/>{isPt ? 'Condução' : 'Drive'}</span>
                    <span className="text-cyan-400">{data.driveTime}</span>
                  </div>
                </div>

                <Link href={`/${locale}/spots/${data.spot.slug}/?sport=${selectedSport}`} className="mt-4 block w-full text-center py-3 bg-cyan-500 hover:bg-cyan-400 text-white rounded-xl font-medium transition-all">
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
