'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Heart, MapPin, ArrowLeft, Wind, Waves, Thermometer } from 'lucide-react';
import { spots } from '@/lib/spots';
import { fetchMarineData, getCurrentConditions } from '@/lib/openmeteo';
import { calculateSurfability, getScoreColor } from '@/lib/surfability';
import FavoriteButton from '@/components/FavoriteButton';
import Link from 'next/link';

interface SpotConditions {
  waveHeight: number;
  wavePeriod: number;
  windSpeed: number;
  windDirection: number;
  windGust: number;
  waterTemp: number;
}

export default function FavoritesPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'pt';
  const isPt = locale === 'pt';
  const [favorites, setFavorites] = useState<string[]>([]);
  const [conditions, setConditions] = useState<Record<string, SpotConditions>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('windspot-favorites');
    if (stored) {
      setFavorites(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!favorites.length) return;

    const fetchAll = async () => {
      const results: Record<string, SpotConditions> = {};
      await Promise.all(
        favorites.map(async (id) => {
          const spot = spots.find(s => s.id === id);
          if (!spot) return;
          try {
            const data = await fetchMarineData(spot.lat, spot.lon);
            const current = getCurrentConditions(data);
            results[id] = current;
          } catch {
            // ignore
          }
        })
      );
      setConditions(results);
    };

    fetchAll();
  }, [favorites]);

  const favoriteSpots = spots.filter(s => favorites.includes(s.id));

  if (loading) {
    return (
      <div className="min-h-screen bg-ocean-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ocean-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-24 space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <Link 
            href={`/${locale}/`} 
            className="inline-flex items-center gap-2 text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {isPt ? 'Voltar' : 'Back'}
          </Link>
          
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-red-500/10">
              <Heart className="w-8 h-8 text-red-400 fill-current" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">
                {isPt ? 'Meus Favoritos' : 'My Favorites'}
              </h1>
              <p className="text-white/60">
                {isPt 
                  ? `${favoriteSpots.length} spot${favoriteSpots.length !== 1 ? 's' : ''} guardado${favoriteSpots.length !== 1 ? 's' : ''}` 
                  : `${favoriteSpots.length} spot${favoriteSpots.length !== 1 ? 's' : ''} saved`
                }
              </p>
            </div>
          </div>
        </div>

        {favoriteSpots.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <Heart className="w-16 h-16 text-white/20 mx-auto" />
            <p className="text-white/40 text-lg">
              {isPt 
                ? 'Ainda não tens favoritos. Vai aos spots e clica no coração!' 
                : 'No favorites yet. Go to spots and click the heart!'
              }
            </p>
            <Link
              href={`/${locale}/spots/`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-ocean-500 hover:bg-ocean-600 text-white rounded-xl font-medium transition-all"
            >
              <MapPin className="w-4 h-4" />
              {isPt ? 'Explorar Spots' : 'Explore Spots'}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {favoriteSpots.map(spot => {
              const current = conditions[spot.id];
              const surfability = current ? calculateSurfability(spot, {
                waveHeight: current.waveHeight,
                wavePeriod: current.wavePeriod,
                waveDirection: current.windDirection,
                windSpeed: current.windSpeed,
                windDirection: current.windDirection,
                waterTemp: current.waterTemp,
              }) : null;

              return (
                <Link 
                  key={spot.id}
                  href={`/${locale}/spots/${spot.slug}/`}
                  className="glass-card overflow-hidden hover:bg-white/10 transition-all duration-300 group"
                >
                  <div className="relative h-40 bg-gradient-to-br from-ocean-800 to-ocean-950 overflow-hidden">
                    <div className="absolute top-3 left-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border bg-wave-500/20 text-wave-300 border-wave-500/30`}>
                        {spot.type}
                      </span>
                    </div>
                    <div className="absolute top-3 right-3">
                      <FavoriteButton spotId={spot.id} spotName={spot.name} size="md" locale={locale} />
                    </div>
                    <div className="absolute bottom-3 left-3 right-3">
                      <h3 className="text-xl font-bold text-white drop-shadow-lg">{spot.name}</h3>
                      <div className="flex items-center gap-1 text-white/70 text-sm">
                        <MapPin className="w-3 h-3" />
                        {spot.region}
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 space-y-3">
                    {current ? (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Waves className="w-4 h-4 text-wave-400" />
                            <span className="text-sm text-white/60">{isPt ? 'Ondas' : 'Waves'}</span>
                          </div>
                          <span className="font-semibold text-white">{current.waveHeight.toFixed(1)}m</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Wind className="w-4 h-4 text-wind-400" />
                            <span className="text-sm text-white/60">{isPt ? 'Vento' : 'Wind'}</span>
                          </div>
                          <span className="font-semibold text-white">{(current.windSpeed * 1.94384).toFixed(0)}kt</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Thermometer className="w-4 h-4 text-surf-400" />
                            <span className="text-sm text-white/60">{isPt ? 'Água' : 'Water'}</span>
                          </div>
                          <span className="font-semibold text-white">{current.waterTemp.toFixed(0)}°C</span>
                        </div>
                        
                        {surfability && (
                          <div className="pt-2 border-t border-white/10">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-white/60">{isPt ? 'Score' : 'Score'}</span>
                              <span className={`font-bold ${getScoreColor(surfability.score).text}`}>
                                {surfability.score}/100
                              </span>
                            </div>
                            <p className="text-sm mt-1" style={{ color: getScoreColor(surfability.score).text.replace('text-', '') }}>
                              {isPt ? surfability.rating : surfability.ratingEn}
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-white/40 text-sm">
                        <Wind className="w-4 h-4 animate-pulse" />
                        {isPt ? 'A carregar...' : 'Loading...'}
                      </div>
                    )}
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
