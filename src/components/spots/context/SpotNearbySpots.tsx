'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getTranslation } from '@/lib/i18n';
import { spots } from '@/lib/spots';
import { fetchMapHours, type MapHoursFile } from '@/lib/mapHours';
import {
  pickMapHourStep,
  nearestSpots,
  nearbySpotScore,
} from '@/lib/context/nearbySpots';
import { formatDistance } from '@/lib/geolocation';
import { getScoreTokens } from '@/lib/sportScore';
import { ALL_SPORTS, type SportType } from '@/lib/sportRatings';
import { useSpotTimelineIndex } from '@/components/spots/timeline/useSpotTimeline';
import type { Spot } from '@/types';

interface SpotNearbySpotsProps {
  spot: Spot;
  locale: string;
  /** Modalidade escolhida na página — a S3 liga-a a partir de
   *  SpotDetailClient. Enquanto não vier: ?sport= → compatibleSports[0]
   *  → 'surf' (ver Dúvidas do relatório S2C). */
  selectedSport?: SportType;
}

/**
 * «Perto daqui» (SPOT-PAGE.md §6): spots vizinhos com distância e o score
 * da MESMA modalidade à hora escolhida no eixo partilhado.
 *
 * Os scores horários dos vizinhos não existem no cliente — usa
 * public/data/map-hours.json (~193 KB / ~31 KB gzip; blob já servido e
 * dentro do budget de dados), pedido lazy quando a secção entra no ecrã
 * (IntersectionObserver) e cacheado em módulo por fetchMapHours(). O passo
 * é de 3 h — o rótulo «±3 h» torna a aproximação explícita.
 */
export default function SpotNearbySpots({ spot, locale, selectedSport }: SpotNearbySpotsProps) {
  const tc = getTranslation(locale).spotPageContext;
  const isPt = locale === 'pt';
  const { selectedHour } = useSpotTimelineIndex();

  // Fallback de modalidade enquanto a prop não é ligada (ver docstring):
  // lê ?sport= depois da hidratação — o mesmo padrão do SpotDetailClient,
  // para não fazer bail do SSR.
  const [urlSport, setUrlSport] = useState<SportType | null>(null);
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('sport');
    if (raw && (ALL_SPORTS as string[]).includes(raw)) setUrlSport(raw as SportType);
  }, []);
  const sport = selectedSport ?? urlSport ?? spot.compatibleSports?.[0] ?? 'surf';

  const rootRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<MapHoursFile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const load = () => {
      void fetchMapHours().then((f) => {
        setFile(f);
        setLoaded(true);
      });
    };
    if (!('IntersectionObserver' in window)) {
      load();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          load();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const near = useMemo(() => nearestSpots(spot, spots, { limit: 5 }), [spot]);
  const step = pickMapHourStep(file?.times ?? [], selectedHour);

  if (!near.length) {
    return <p className="text-meta-sm text-fg-muted">{tc.noNearbySpots}</p>;
  }

  return (
    <div ref={rootRef}>
      <ul className="list-none p-0 m-0 divide-y divide-divider" data-testid="nearby-spots">
        {near.map((entry) => {
          const s = entry.spot;
          const practised =
            !s.compatibleSports?.length || s.compatibleSports.includes(sport);
          const score = file && practised
            ? nearbySpotScore(file, entry, sport, step)
            : null;
          const tokens = score !== null ? getScoreTokens(score) : null;
          return (
            <li key={s.id}>
              <a
                href={`/${locale}/spots/${s.slug}/?sport=${sport}`}
                className="flex items-center gap-2.5 py-2 min-h-[44px] -my-0.5 group"
                data-nearby-spot={s.id}
              >
                {/* Mosaico de score na cor do escalão (§6 v3). */}
                {score !== null && tokens ? (
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-card border font-mono tabular-nums text-sm font-bold ${tokens.bg} ${tokens.border} ${tokens.text}`}
                    data-nearby-score={s.id}
                    data-score-tier={tokens.tier}
                  >
                    {score}
                  </span>
                ) : (
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card border border-divider text-sm text-fg-subtle"
                    aria-label={
                      loaded && !practised ? tc.notPracticedHere : undefined
                    }
                    data-nearby-score={s.id}
                  >
                    —
                  </span>
                )}
                {/* Nome nunca trunca (spec v3 §8) — quebra em 2 linhas. */}
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-sm font-medium text-fg group-hover:text-data-waves transition-colors"
                    data-nearby-name={s.id}
                  >
                    {isPt ? s.name : s.nameEn}
                  </span>
                  <span className="block text-meta-sm text-fg-subtle">
                    {isPt ? s.region : s.regionEn} · {formatDistance(entry.distanceKm, locale)}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      <p className="text-meta-sm text-fg-subtle mt-1.5">{tc.nearbyScoreNote}</p>
    </div>
  );
}
