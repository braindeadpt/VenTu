'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Heart, MapPin, ArrowLeft, Wind, Waves, Thermometer } from 'lucide-react';
import { spots } from '@/lib/spots';
import { fetchMarineData, getCurrentConditions } from '@/lib/openmeteo';
import { getSportScore, getScoreColor } from '@/lib/sportScore';
import type { SportType } from '@/lib/sportRatings';
import { getAssetPath } from '@/lib/paths';
import FavoriteButton from '@/components/FavoriteButton';
import Link from 'next/link';

interface SpotConditions {
  waveHeight: number;
  wavePeriod: number;
  waveDirection: number;
  windSpeed: number;
  windDirection: number;
  windGust: number;
  waterTemp: number;
  source?: 'real' | 'mock';
}

export default function FavoritesClient() {
  const params = useParams();
  const locale = (params?.locale as string) || 'pt';
  const isPt = locale === 'pt';
  const [favorites, setFavorites] = useState<string[]>([]);
  const [conditions, setConditions] = useState<Record<string, SpotConditions>>({});
  const [sportScores, setSportScores] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('windspot-favorites');
    if (stored) setFavorites(JSON.parse(stored));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!favorites.length) return;

    const fetchAll = async () => {
      const results: Record<string, SpotConditions> = {};
      const scores: Record<string, any> = {};
      
      try {
        const response = await fetch(getAssetPath('/data/conditions.json'), { cache: 'no-store' });
        if (response.ok) {
          const precomputed = await response.json();
          
          for (const id of favorites) {
            const spot = spots.find(s => s.id === id);
            if (!spot) continue;
            
            const cond = precomputed[id];
            if (cond) {
              const current = {
                waveHeight: cond.waveHeight || 0,
                wavePeriod: cond.wavePeriod || 0,
                waveDirection: cond.waveDirection || 0,
                windSpeed: cond.windSpeed || 0,
                windDirection: cond.windDirection || 0,
                windGust: cond.windGust || 0,
                waterTemp: cond.waterTemp || 0,
              };
              results[id] = current;
              
              const primarySport = (spot.compatibleSports?.[0] || spot.type) as SportType;
              scores[id] = getSportScore(spot, primarySport, current);
            }
          }
          
          if (favorites.every(id => results[id])) {
            setConditions(results);
            setSportScores(scores);
            return;
          }
        }
      } catch (e) {
        console.warn('Precomputed conditions not available, falling back to live fetch');
      }
      
      await Promise.all(
        favorites.map(async (id) => {
          if (results[id]) return;
          
          const spot = spots.find(s => s.id === id);
          if (!spot) return;
          try {
            const data = await fetchMarineData(spot.lat, spot.lon);
            const current = getCurrentConditions(data);
            results[id] = current;
            
            const primarySport = (spot.compatibleSports?.[0] || spot.type) as SportType;
            scores[id] = getSportScore(spot, primarySport, current);
          } catch { /* ignore */ }
        })
      );
      
      setConditions(results);
      setSportScores(scores);
    };

    fetchAll();
  }, [favorites]);

  const favoriteSpots = spots.filter(s => favorites.includes(s.id));

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div className="space-y-4">
          <Link href={`/${locale}/`} className="inline-flex items-center gap-2 text-white/50 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
            {isPt ? 'Voltar' : 'Back'}
          </Link>
          
          <div className="flex items-center gap-3">
            <Heart className="w-8 h-8 text-red-400 fill-current" />
            <div>
              <h1 className="text-3xl font-bold text-white">{isPt ? 'Meus Favoritos' : 'My Favorites'}</h1>
              <p className="text-white/60">{favoriteSpots.length} {isPt ? 'spots' : 'spots'}</p>
            </div>
          </div>
        </div>

        {favoriteSpots.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <Heart className="w-16 h-16 text-white/20 mx-auto" />
            <p className="text-white/40">{isPt ? 'Ainda não tens favoritos.' : 'No favorites yet.'}</p>
            <Link href={`/${locale}/spots/`} className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl">
              {isPt ? 'Explorar Spots' : 'Explore Spots'}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {favoriteSpots.map(spot => {
              const current = conditions[spot.id];
              const score = sportScores[spot.id];
              const colors = score ? getScoreColor(score.score) : { bg: 'bg-slate-500/20', text: 'text-slate-400' };

              return (
                <Link key={spot.id} href={`/${locale}/spots/${spot.slug}/`} className="block">
                  <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden hover:bg-white/10 transition-all duration-300 hover:-translate-y-1">
                    <div className="relative h-40 bg-gradient-to-br from-slate-700 to-slate-800">
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
                      <div className="absolute top-3 right-3">
                        <FavoriteButton spotId={spot.id} spotName={spot.name} size="md" locale={locale} />
                      </div>
                      <div className="absolute bottom-3 left-3 right-3">
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-bold text-white">{spot.name}</h3>
                          {current?.source === 'mock' && (
                            <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              DEMO
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-white/60">
                          <MapPin className="w-3 h-3" />{spot.region}
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 space-y-3">
                      {current ? (
                        <>
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-1.5 text-white/60"><Waves className="w-4 h-4 text-cyan-400" />{current.waveHeight.toFixed(1)}m</span>
                            <span className="flex items-center gap-1.5 text-white/60"><Wind className="w-4 h-4 text-sky-400" />{(current.windSpeed * 1.94384).toFixed(0)}kt</span>
                            <span className="flex items-center gap-1.5 text-white/60"><Thermometer className="w-4 h-4 text-emerald-400" />{current.waterTemp.toFixed(0)}°C</span>
                          </div>
                          
                          {score && (
                            <div className="pt-2 border-t border-white/10">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-white/60">{isPt ? 'Score' : 'Score'}</span>
                                <span className={`font-bold ${colors.text}`}>{score.score}/100</span>
                              </div>
                              <p className={`text-sm mt-1 ${colors.text}`}>{isPt ? score.rating : score.ratingEn}</p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-white/40 text-sm"><Wind className="w-4 h-4 animate-pulse" />{isPt ? 'A carregar...' : 'Loading...'}</div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
