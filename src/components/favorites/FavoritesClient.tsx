'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Heart, ArrowLeft, Share2, Check, LogIn } from 'lucide-react';
import { spots } from '@/lib/spots';
import { fetchMarineData, getCurrentConditions } from '@/lib/openmeteo';
import { isNoite, isSemDados, notaV6DoSpot, scoreAgoraComV6 } from '@/lib/notaV6Agora';
import type { UpcomingWindowsBySport } from '@/lib/bestWindowToday';
import { compararJanelas, janelaSeguinte } from '@/lib/noiteListas';
import { janelasDeNoite } from '@/lib/janelasNoiteCliente';
import { getTranslation } from '@/lib/i18n';
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
import { hasTestSupabaseClient } from '@/lib/supabase';
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
  const semDadosTxt = getTranslation(loc).map.noData;
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
  const [sportScores, setSportScores] = useState<Record<string, { score: number; rating: string; ratingEn: string; semDados?: true; noite?: true }>>({});
  // Noite (opção A, 28/10): próximas janelas dos favoritos de noite (o mesmo cálculo do bake) e o relógio delas
  const [janelas, setJanelas] = useState<{ nowMs: number; porSpot: Record<string, UpcomingWindowsBySport> } | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  // The Supabase-configured state is baked at build time, so a keyless build
  // and a keyed build disagree about it between server render and the first
  // client paint (the E2E mock flips it client-side on purpose). Staying on
  // the skeleton until mount keeps the hydrated subtree identical in every
  // build; the readiness branch below is stable afterwards.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!session?.user || !favorites.length) return;

    const fetchAll = async () => {
      const results: Record<string, SpotConditions> = {};
      const scores: Record<string, { score: number; rating: string; ratingEn: string; semDados?: true; noite?: true }> = {};
      const deNoite: Array<() => Promise<readonly [string, UpcomingWindowsBySport]>> = [];
      const nowMs = Date.now();

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
              // kitesurf/surf: o `notaV6` do pipeline (#218 PR 4) — o mesmo número do /mapa e das listas
              const nv = notaV6DoSpot(spot, precomputed);
              scores[id] = scoreAgoraComV6(spot, primarySport, scoreInput, nv);
              if (isNoite(scores[id]))
                deNoite.push(() =>
                  janelasDeNoite(spot, scoreInput, nv, nowMs)
                    .catch(() => ({}) as UpcomingWindowsBySport)
                    .then((w) => [id, w] as const),
                );
            }
          }

          if (favorites.every((id) => results[id])) {
            // de noite, as janelas chegam com os scores (nunca «Sem janela» à espera do forecast)
            const pares = deNoite.length ? await Promise.all(deNoite.map((f) => f())) : [];
            setConditions(results);
            setSportScores(scores);
            setJanelas(pares.length ? { nowMs, porSpot: Object.fromEntries(pares) } : null);
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
            // sem `notaV6` do pipeline: v6 «sem dados», SUP / wakeboard no motor antigo (#218, PR 6)
            scores[id] = scoreAgoraComV6(spot, primarySport, current, null);
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
  // The E2E seam installs a fake Supabase client in test builds only; it must
  // not flip the global isSupabaseConfigured (the layout reads it during
  // render), so readiness is resolved locally on this page.
  const supabaseReady = isSupabaseReady || hasTestSupabaseClient();
  const primaryOf = (spot: (typeof spots)[number]) => (spot.compatibleSports?.[0] || spot.type) as SportType;
  const janelaDe = (spot: (typeof spots)[number]) =>
    janelas && isNoite(sportScores[spot.id])
      ? janelaSeguinte({ spot, upcomingWindowsBySport: janelas.porSpot[spot.id] }, primaryOf(spot), janelas.nowMs)
      : null;
  const favoriteSpots = spots
    .filter((s) => favorites.includes(s.id))
    .sort((a, b) => {
      // de noite pela próxima janela (dia, nota, início); os de dia à frente, pela nota
      const na = isNoite(sportScores[a.id]);
      const nb = isNoite(sportScores[b.id]);
      if (na !== nb) return na ? 1 : -1;
      if (na) return compararJanelas(janelaDe(a), janelaDe(b));
      return (sportScores[b.id]?.score ?? 0) - (sportScores[a.id]?.score ?? 0);
    });

  if (!mounted || loading) {
    return (
      <div id="alertas" className="min-h-screen bg-bg-base p-4 scroll-mt-24">
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

  if (!supabaseReady) {
    return (
      <div id="alertas" className="min-h-screen bg-bg-base flex items-center justify-center px-4 scroll-mt-24">
        <p className="text-sm text-fg-muted text-center">
          {pt ? 'Favoritos indisponíveis (Supabase não configurado).' : 'Favorites unavailable (Supabase not configured).'}
        </p>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-bg-base pb-20">
        <div id="alertas" className="max-w-md mx-auto px-4 py-16 text-center space-y-6 scroll-mt-24">
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

        {/* Destino de `/xx/alerts/#alertas` (e do atalho de `/xx/conta/`): existe
            em TODOS os estados — painel de alertas quando há favoritos, convite a
            adicionar favoritos quando não há — e já no HTML do build. Antes o `id`
            vivia no painel, que só monta com sessão E favoritos: o link não saltava
            (mega audit 2026-09-26, achado A7 — o único caso em 114 574 links). */}
        <div id="alertas" className="scroll-mt-24">
          {favoriteSpots.length > 0 ? (
            <FavoritesAlertsPanel locale={loc} favoriteCount={favoriteSpots.length} />
          ) : (
            <EmptyState
              icon={<Heart className="w-8 h-8 text-fg-subtle" aria-hidden />}
              title={getPlayfulEmptyCopy('no-favorites', loc).title}
              description={getPlayfulEmptyCopy('no-favorites', loc).description}
              action={
                <Button href={`/${loc}/spots/`} size="lg" locale={locale}>
                  {pt ? 'Explorar Spots' : 'Explore Spots'}
                </Button>
              }
            />
          )}
        </div>

        {favoriteSpots.length > 0 && (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 list-none m-0 p-0">
            {favoriteSpots.map((spot, index) => {
              const current = conditions[spot.id];
              const score = sportScores[spot.id]?.score ?? 0;
              // v6 sem `notaV6` (live Open-Meteo): «Sem dados», não «0 · N/A» (#218 PR 6)
              const semDados = isSemDados(sportScores[spot.id]);
              const noite = isNoite(sportScores[spot.id]);
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
                    semNota={semDados ? semDadosTxt : null}
                    noite={noite ? { janela: janelaDe(spot) } : null}
                    statusLine={
                      semDados
                        ? semDadosTxt
                        : current
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
