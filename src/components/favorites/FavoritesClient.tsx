'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Heart, MapPin, ArrowLeft, Wind, Waves, Thermometer, Share2, Check, LogIn } from 'lucide-react';
import { spots } from '@/lib/spots';
import { fetchMarineData, getCurrentConditions } from '@/lib/openmeteo';
import { getSportScore, getScoreColor } from '@/lib/sportScore';
import type { SportType } from '@/lib/sportRatings';
import { getAssetPath } from '@/lib/paths';
import { useAuth } from '@/contexts/AuthProvider';
import FavoriteButton from '@/components/FavoriteButton';
import DataSourceBadge from '@/components/ui/DataSourceBadge';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { getPlayfulEmptyCopy } from '@/lib/emptyStateCopy';
import { getConditionsDataId } from '@/lib/spotConditionsSource';
import Skeleton from '@/components/ui/Skeleton';
import FavoritesAlertsPanel from '@/components/alerts/FavoritesAlertsPanel';

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
  const loc = (params?.locale as string) || 'pt';
  const pt = loc === 'pt';
  const {
    session,
    authLoading,
    favorites,
    favoritesLoading,
    favoritesReady,
    isSupabaseReady,
    requestLogin,
  } = useAuth();
  const [conditions, setConditions] = useState<Record<string, SpotConditions>>({});
  const [sportScores, setSportScores] = useState<Record<string, { score: number; rating: string; ratingEn: string }>>({});
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    if (!session?.user || !favorites.length) return;

    const fetchAll = async () => {
      const results: Record<string, SpotConditions> = {};
      const scores: Record<string, { score: number; rating: string; ratingEn: string }> = {};

      try {
        const response = await fetch(getAssetPath('/data/conditions.json'), { cache: 'no-store' });
        if (response.ok) {
          const precomputed = await response.json();

          for (const id of favorites) {
            const spot = spots.find((s) => s.id === id);
            if (!spot) continue;

            const cond = precomputed[getConditionsDataId(spot)];
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
              results[id] = { ...current, source: 'real', updatedAt: cond.updatedAt };
              const primarySport = (spot.compatibleSports?.[0] || spot.type) as SportType;
              scores[id] = getSportScore(spot, primarySport, current);
            }
          }

          if (favorites.every((id) => results[id])) {
            setConditions(results);
            setSportScores(scores);
            return;
          }
        }
      } catch {
        /* fallback below */
      }

      await Promise.all(
        favorites.map(async (id) => {
          if (results[id]) return;
          const spot = spots.find((s) => s.id === id);
          if (!spot) return;
          try {
            const data = await fetchMarineData(spot.lat, spot.lon);
            const current = getCurrentConditions(data);
            results[id] = current;
            const primarySport = (spot.compatibleSports?.[0] || spot.type) as SportType;
            scores[id] = getSportScore(spot, primarySport, current);
          } catch {
            /* ignore */
          }
        }),
      );

      setConditions(results);
      setSportScores(scores);
    };

    void fetchAll();
  }, [favorites, session?.user]);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      prompt('Copy this link:', window.location.href);
    }
  };

  const loading = authLoading || (session?.user && !favoritesReady) || favoritesLoading;
  const favoriteSpots = spots.filter((s) => favorites.includes(s.id));

  if (!isSupabaseReady) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center px-4">
        <p className="text-sm text-fg-muted text-center">
          {pt ? 'Favoritos indisponíveis (Supabase não configurado).' : 'Favorites unavailable (Supabase not configured).'}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base p-4">
        <div className="max-w-4xl mx-auto space-y-8 pt-8">
          <Skeleton className="h-5 w-20" />
          <div className="space-y-3">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-card" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-bg-base pb-20">
        <div className="max-w-md mx-auto px-4 py-16 text-center space-y-6">
          <LogIn className="w-10 h-10 mx-auto text-data-waves" aria-hidden />
          <h1 className="text-h2 text-fg">{pt ? 'Meus Favoritos' : 'My Favorites'}</h1>
          <p className="text-sm text-fg-muted">
            {pt
              ? 'Entra com o teu email para guardar spots e vê-los em qualquer dispositivo.'
              : 'Sign in with your email to save spots and see them on any device.'}
          </p>
          <Button size="lg" onClick={() => requestLogin('favorites-page')}>
            {pt ? 'Entrar com magic link' : 'Sign in with magic link'}
          </Button>
          <Button href={`/${loc}/spots/`} variant="secondary" size="md" locale={loc as 'pt' | 'en'}>
            {pt ? 'Explorar spots' : 'Explore spots'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base pb-20">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div className="space-y-4">
          <Link href={`/${loc}/`} className="inline-flex items-center gap-2 text-fg-muted hover:text-fg">
            <ArrowLeft className="w-4 h-4" />
            {pt ? 'Voltar' : 'Back'}
          </Link>

          <PageHeader
            icon={<Heart className="w-8 h-8 text-windDir-onshore fill-current" aria-hidden />}
            title={pt ? 'Meus Favoritos' : 'My Favorites'}
            subtitle={`${favoriteSpots.length} spots`}
          />
          {favoriteSpots.length > 0 && (
            <div className="flex justify-end -mt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleShare}
                className={shareCopied ? 'text-score-good border-score-good/30' : ''}
              >
                {shareCopied ? <Check className="w-4 h-4" aria-hidden /> : <Share2 className="w-4 h-4" aria-hidden />}
                {shareCopied ? (pt ? 'Copiado!' : 'Copied!') : pt ? 'Partilhar' : 'Share'}
              </Button>
            </div>
          )}
        </div>

        {favoriteSpots.length > 0 && (
          <FavoritesAlertsPanel locale={loc} favoriteCount={favoriteSpots.length} />
        )}

        {favoriteSpots.length === 0 ? (
          <EmptyState
            icon={<Heart className="w-8 h-8 text-fg-subtle" aria-hidden />}
            title={getPlayfulEmptyCopy('no-favorites', pt).title}
            description={getPlayfulEmptyCopy('no-favorites', pt).description}
            action={
              <Button href={`/${loc}/spots/`} size="lg" locale={loc as 'pt' | 'en'}>
                {pt ? 'Explorar Spots' : 'Explore Spots'}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {favoriteSpots.map((spot) => {
              const current = conditions[spot.id];
              const score = sportScores[spot.id];
              const colors = score ? getScoreColor(score.score) : { bg: 'bg-surface-2/[0.08]', text: 'text-fg-subtle' };

              return (
                <Link key={spot.id} href={`/${loc}/spots/${spot.slug}/`} className="block">
                  <div className="bg-surface-1/[0.04] backdrop-blur-sm border border-divider rounded-2xl overflow-hidden hover:bg-surface-2/[0.08] transition-all duration-300 hover:-translate-y-1">
                    <div className="relative h-40 bg-gradient-to-br from-bg-elevated to-bg-base">
                      <div className="absolute inset-0 bg-gradient-to-t from-bg-base/80 to-transparent" />
                      <div className="absolute top-3 right-3">
                        <FavoriteButton spotId={spot.id} spotName={spot.name} size="md" locale={loc} />
                      </div>
                      <div className="absolute bottom-3 left-3 right-3">
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-bold text-fg">{spot.name}</h3>
                          <DataSourceBadge
                            source={current?.source}
                            updatedAt={current?.updatedAt}
                            locale={loc}
                          />
                        </div>
                        <div className="flex items-center gap-1 text-sm text-fg-muted">
                          <MapPin className="w-3 h-3" />
                          {spot.region}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      {current ? (
                        <>
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-1.5 text-fg-muted">
                              <Waves className="w-4 h-4 text-data-waves" />
                              {current.waveHeight.toFixed(1)}m
                            </span>
                            <span className="flex items-center gap-1.5 text-fg-muted">
                              <Wind className="w-4 h-4 text-data-wind" />
                              {(current.windSpeed * 1.94384).toFixed(0)}kt
                            </span>
                            <span className="flex items-center gap-1.5 text-fg-muted">
                              <Thermometer className="w-4 h-4 text-data-water" />
                              {current.waterTemp.toFixed(0)}°C
                            </span>
                          </div>
                          {score && (
                            <div className="pt-2 border-t border-divider">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-fg-muted">Score</span>
                                <span className={`font-bold ${colors.text}`}>{score.score}/100</span>
                              </div>
                              <p className={`text-sm mt-1 ${colors.text}`}>{pt ? score.rating : score.ratingEn}</p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-fg-subtle text-sm">
                          <Wind className="w-4 h-4 animate-pulse" />
                          {pt ? 'A carregar...' : 'Loading...'}
                        </div>
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
