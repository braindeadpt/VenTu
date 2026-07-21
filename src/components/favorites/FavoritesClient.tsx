'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Heart, ArrowLeft, Share2, Check, LogIn } from 'lucide-react';
import { spots } from '@/lib/spots';
import { fetchMarineData, getCurrentConditions } from '@/lib/openmeteo';
import { getSportScore } from '@/lib/sportScore';
import type { SportType } from '@/lib/sportRatings';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { getAssetPath } from '@/lib/paths';
import { useAuth } from '@/contexts/AuthProvider';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { getPlayfulEmptyCopy } from '@/lib/emptyStateCopy';
import { getConditionsDataId } from '@/lib/spotConditionsSource';
import { rawToScoreInput } from '@/lib/scoreConditions';
import Skeleton from '@/components/ui/Skeleton';
import FavoritesAlertsPanel from '@/components/alerts/FavoritesAlertsPanel';
import SpotListCard from '@/components/spots/SpotListCard';
import FavoriteButton from '@/components/FavoriteButton';
import { cn } from '@/lib/cn';

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
  const locale = (loc === 'en' ? 'en' : 'pt') as 'pt' | 'en';
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

            const cond = precomputed[getConditionsDataId(spot)] ?? precomputed[spot.id];
            if (cond && typeof cond === 'object') {
              const scoreInput = rawToScoreInput(cond as Record<string, unknown>);
              results[id] = {
                ...scoreInput,
                source: 'real',
                updatedAt: typeof cond.updatedAt === 'string' ? cond.updatedAt : undefined,
              };
              const primarySport = (spot.compatibleSports?.[0] || spot.type) as SportType;
              scores[id] = getSportScore(spot, primarySport, scoreInput);
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
  const favoriteSpots = spots
    .filter((s) => favorites.includes(s.id))
    .sort((a, b) => (sportScores[b.id]?.score ?? 0) - (sportScores[a.id]?.score ?? 0));

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-divider bg-surface-1/[0.04]">
            <LogIn className="w-6 h-6 text-data-waves" aria-hidden />
          </div>
          <h1 className="font-display text-h2 text-fg">{pt ? 'Meus Favoritos' : 'My Favorites'}</h1>
          <p className="text-sm text-fg-muted leading-relaxed">
            {pt
              ? 'Entra com o teu email para guardar spots e vê-los em qualquer dispositivo.'
              : 'Sign in with your email to save spots and see them on any device.'}
          </p>
          <Button size="lg" onClick={() => requestLogin('favorites-page')}>
            {pt ? 'Entrar com magic link' : 'Sign in with magic link'}
          </Button>
          <Button href={`/${loc}/spots/`} variant="secondary" size="md" locale={locale}>
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
          <Link
            href={`/${loc}/`}
            className="inline-flex items-center gap-2 text-fg-muted hover:text-fg min-h-[44px] transition-colors duration-150"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            {pt ? 'Voltar' : 'Back'}
          </Link>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <PageHeader
              icon={<Heart className="w-7 h-7 text-data-waves" aria-hidden />}
              title={pt ? 'Meus Favoritos' : 'My Favorites'}
              subtitle={
                pt
                  ? `${favoriteSpots.length} spot${favoriteSpots.length === 1 ? '' : 's'} · ordenados por score`
                  : `${favoriteSpots.length} spot${favoriteSpots.length === 1 ? '' : 's'} · sorted by score`
              }
            />
            {favoriteSpots.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleShare}
                className={cn(shareCopied && 'text-score-good border-score-good/30')}
              >
                {shareCopied ? <Check className="w-4 h-4" aria-hidden /> : <Share2 className="w-4 h-4" aria-hidden />}
                {shareCopied ? (pt ? 'Copiado!' : 'Copied!') : pt ? 'Partilhar' : 'Share'}
              </Button>
            )}
          </div>
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
              <Button href={`/${loc}/spots/`} size="lg" locale={locale}>
                {pt ? 'Explorar Spots' : 'Explore Spots'}
              </Button>
            }
          />
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 list-none m-0 p-0">
            {favoriteSpots.map((spot, index) => {
              const current = conditions[spot.id];
              const score = sportScores[spot.id]?.score ?? 0;
              const primarySport = (spot.compatibleSports?.[0] || spot.type) as SportType;
              const sportLabel = SPORT_LABELS[primarySport]
                ? pt
                  ? SPORT_LABELS[primarySport].pt
                  : SPORT_LABELS[primarySport].en
                : undefined;

              return (
                <li key={spot.id} className="relative">
                  <div className="absolute top-3 right-3 z-10">
                    <FavoriteButton spotId={spot.id} spotName={spot.name} size="md" locale={loc} />
                  </div>
                  <SpotListCard
                    name={pt ? spot.name : spot.nameEn}
                    region={pt ? spot.region : spot.regionEn}
                    score={score}
                    conditions={{
                      waveHeight: current?.waveHeight ?? 0,
                      wavePeriod: current?.wavePeriod ?? 0,
                      windSpeed: current?.windSpeed ?? 0,
                    }}
                    href={`/${loc}/spots/${spot.slug}/`}
                    locale={locale}
                    sportLabel={sportLabel}
                    sportAccent={primarySport}
                    rank={index + 1}
                    withImage
                    spot={spot}
                    statusLine={
                      current
                        ? pt
                          ? sportScores[spot.id]?.rating
                          : sportScores[spot.id]?.ratingEn
                        : pt
                          ? 'A carregar…'
                          : 'Loading…'
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
