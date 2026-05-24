'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Heart, MapPin, ArrowLeft, Wind, Waves, Thermometer, Share2, Check } from 'lucide-react';
import { spots } from '@/lib/spots';
import { fetchMarineData, getCurrentConditions } from '@/lib/openmeteo';
import { getSportScore, getScoreColor } from '@/lib/sportScore';
import type { SportType } from '@/lib/sportRatings';
import { getAssetPath } from '@/lib/paths';
import FavoriteButton from '@/components/FavoriteButton';
import Link from 'next/link';
import DataSourceBadge from '@/components/ui/DataSourceBadge';

interface SpotConditions {
  waveHeight: number;
  wavePeriod: number;
  waveDirection: number;
  windSpeed: number;
  windDirection: number;
  windGust: number;
  waterTemp: number;
  source?: 'real' | 'mock';
  updatedAt?: string;
}

export default function FavoritesClient() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = (params?.locale as string) || 'pt';
  const isPt = locale === 'pt';
  const [favorites, setFavorites] = useState<string[]>([]);
  const [conditions, setConditions] = useState<Record<string, SpotConditions>>({});
  const [sportScores, setSportScores] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [shareCopied, setShareCopied] = useState(false);

  const initFavorites = useCallback(() => {
    const urlFavs = searchParams.get('favs');
    if (urlFavs) {
      const parsed = urlFavs.split(',').filter(Boolean);
      if (parsed.length > 0) {
        return parsed;
      }
    }
    const stored = localStorage.getItem('windspot-favorites');
    return stored ? JSON.parse(stored) : [];
  }, [searchParams]);

  useEffect(() => {
    const favs = initFavorites();
    setFavorites(favs);
    localStorage.setItem('windspot-favorites', JSON.stringify(favs));
    setLoading(false);
  }, [initFavorites]);

  const updateUrl = useCallback((favs: string[]) => {
    const url = new URL(window.location.href);
    if (favs.length > 0) {
      url.searchParams.set('favs', favs.join(','));
    } else {
      url.searchParams.delete('favs');
    }
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);

  const handleRemoveFavorite = (spotId: string) => {
    const newFavs = favorites.filter(id => id !== spotId);
    setFavorites(newFavs);
    localStorage.setItem('windspot-favorites', JSON.stringify(newFavs));
    updateUrl(newFavs);
  };

  const handleShare = async () => {
    const url = new URL(window.location.href);
    if (favorites.length > 0) {
      url.searchParams.set('favs', favorites.join(','));
    }
    try {
      await navigator.clipboard.writeText(url.toString());
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      prompt('Copy this link:', url.toString());
    }
  };

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
              results[id] = {
                ...current,
                source: 'real',
                updatedAt: cond.updatedAt,
              };
              
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
      <div className="min-h-screen bg-bg-base p-4 space-y-6 animate-pulse">
        <div className="max-w-4xl mx-auto space-y-4 pt-8">
          <div className="h-8 w-20 bg-surface-1 rounded" />
          <div className="h-10 w-48 bg-surface-1 rounded" />
        </div>
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-40 bg-surface-1 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base pb-20">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div className="space-y-4">
          <Link href={`/${locale}/`} className="inline-flex items-center gap-2 text-fg-muted hover:text-fg">
            <ArrowLeft className="w-4 h-4" />
            {isPt ? 'Voltar' : 'Back'}
          </Link>
          
          <div className="flex items-center gap-3">
            <Heart className="w-8 h-8 text-windDir-onshore fill-current" />
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-fg">{isPt ? 'Meus Favoritos' : 'My Favorites'}</h1>
              <p className="text-fg-muted">{favoriteSpots.length} {isPt ? 'spots' : 'spots'}</p>
            </div>
            {favoriteSpots.length > 0 && (
              <button
                onClick={handleShare}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  shareCopied
                    ? 'bg-score-good/20 text-score-good border border-score-good/30'
                    : 'bg-surface-2 text-fg-subtle hover:text-fg border border-divider'
                }`}
              >
                {shareCopied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                {shareCopied ? (isPt ? 'Copiado!' : 'Copied!') : (isPt ? 'Partilhar' : 'Share')}
              </button>
            )}
          </div>
        </div>

        {favoriteSpots.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <Heart className="w-16 h-16 text-fg-subtle mx-auto" />
            <p className="text-fg-subtle">{isPt ? 'Ainda não tens favoritos.' : 'No favorites yet.'}</p>
            <Link href={`/${locale}/spots/`} className="inline-flex items-center gap-2 px-6 py-3 bg-data-waves text-bg-base rounded-xl">
              {isPt ? 'Explorar Spots' : 'Explore Spots'}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {favoriteSpots.map(spot => {
              const current = conditions[spot.id];
              const score = sportScores[spot.id];
              const colors = score ? getScoreColor(score.score) : { bg: 'bg-surface-2', text: 'text-fg-subtle' };

              return (
                <Link key={spot.id} href={`/${locale}/spots/${spot.slug}/`} className="block">
                  <div className="bg-surface-1 backdrop-blur-sm border border-divider rounded-2xl overflow-hidden hover:bg-surface-2 transition-all duration-300 hover:-translate-y-1">
                    <div className="relative h-40 bg-gradient-to-br from-bg-elevated to-bg-base">
                      <div className="absolute inset-0 bg-gradient-to-t from-bg-base/80 to-transparent" />
                      <div className="absolute top-3 right-3">
                        <FavoriteButton spotId={spot.id} spotName={spot.name} size="md" locale={locale} />
                      </div>
                      <div className="absolute bottom-3 left-3 right-3">
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-bold text-fg">{spot.name}</h3>
                          <DataSourceBadge
                            source={current?.source}
                            updatedAt={current?.updatedAt}
                            locale={locale}
                          />
                        </div>
                        <div className="flex items-center gap-1 text-sm text-fg-muted">
                          <MapPin className="w-3 h-3" />{spot.region}
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 space-y-3">
                      {current ? (
                        <>
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-1.5 text-fg-muted"><Waves className="w-4 h-4 text-data-waves" />{current.waveHeight.toFixed(1)}m</span>
                            <span className="flex items-center gap-1.5 text-fg-muted"><Wind className="w-4 h-4 text-data-wind" />{(current.windSpeed * 1.94384).toFixed(0)}kt</span>
                            <span className="flex items-center gap-1.5 text-fg-muted"><Thermometer className="w-4 h-4 text-data-water" />{current.waterTemp.toFixed(0)}°C</span>
                          </div>
                          
                          {score && (
                            <div className="pt-2 border-t border-divider">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-fg-muted">{isPt ? 'Score' : 'Score'}</span>
                                <span className={`font-bold ${colors.text}`}>{score.score}/100</span>
                              </div>
                              <p className={`text-sm mt-1 ${colors.text}`}>{isPt ? score.rating : score.ratingEn}</p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-fg-subtle text-sm"><Wind className="w-4 h-4 animate-pulse" />{isPt ? 'A carregar...' : 'Loading...'}</div>
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
