'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSpotBySlug, spots } from '@/lib/spots';
import { getAllSportScores, getScoreTokens } from '@/lib/sportScore';
import { rawToScoreInput } from '@/lib/scoreConditions';
import { SITE_URL } from '@/lib/seo';

type ConditionsFile = Record<
  string,
  {
    windSpeed?: number;
    windDirection?: number;
    waveHeight?: number;
    swellHeight?: number;
    swellPeriod?: number;
    wavePeriod?: number;
    waterTemp?: number;
  }
>;

export default function EmbedSpotWidget({ slug }: { slug: string }) {
  const search = useSearchParams();
  const school = search.get('school') || '';
  const lang = search.get('lang') === 'en' ? 'en' : 'pt';
  const isPt = lang === 'pt';

  const spot = useMemo(() => getSpotBySlug(slug) || spots.find((s) => s.id === slug), [slug]);
  const [score, setScore] = useState<number | null>(null);
  const [wave, setWave] = useState<string | null>(null);
  const [wind, setWind] = useState<string | null>(null);

  useEffect(() => {
    if (!spot) return;
    let cancelled = false;
    void fetch('/data/conditions.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((file: ConditionsFile | null) => {
        if (cancelled || !file) return;
        const raw = file[spot.id] || file[spot.slug];
        if (!raw) return;
        const input = rawToScoreInput(raw as Record<string, unknown>);
        const sports = getAllSportScores(spot, input);
        const best = Math.max(0, ...Object.values(sports).map((s) => s.score));
        setScore(Number.isFinite(best) ? best : 0);
        const h = raw.swellHeight ?? raw.waveHeight;
        if (h != null) setWave(`${Number(h).toFixed(1)} m`);
        if (raw.windSpeed != null) setWind(`${(raw.windSpeed * 1.94384).toFixed(0)} kt`);
      })
      .catch(() => {
        /* offline */
      });
    return () => {
      cancelled = true;
    };
  }, [spot]);

  if (!spot) {
    return (
      <div className="p-4 text-sm text-fg-muted">
        {isPt ? 'Spot não encontrado.' : 'Spot not found.'}
      </div>
    );
  }

  const tokens = score != null ? getScoreTokens(score) : null;
  const spotHref = `${SITE_URL}/${lang}/spots/${spot.slug}/`;
  const name = school || (isPt ? spot.name : spot.nameEn);

  return (
    <div className="min-h-screen bg-bg-base text-fg p-3 font-sans">
      <a
        href={spotHref}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-card border border-divider bg-bg-elevated p-3 shadow-card hover:border-divider-strong transition-colors duration-150"
      >
        {school && (
          <p className="text-meta-sm font-semibold text-fg-muted mb-1 truncate">{school}</p>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-h3 text-fg truncate">
              {isPt ? spot.name : spot.nameEn}
            </p>
            <p className="text-meta-sm text-fg-muted mt-0.5">
              {[wave, wind].filter(Boolean).join(' · ') || (isPt ? 'Condições VenTu' : 'VenTu conditions')}
            </p>
          </div>
          {score != null && tokens && (
            <div
              className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-mono font-bold text-lg tabular-nums border ${tokens.text} ${tokens.bg} ${tokens.border}`}
              aria-label={`Score ${score}`}
            >
              {Math.round(score)}
            </div>
          )}
        </div>
        <p className="text-meta-sm text-fg-subtle mt-2">
          {name ? `${isPt ? 'via' : 'via'} VenTu` : 'VenTu'} · {isPt ? 'condições' : 'conditions'}
        </p>
      </a>
    </div>
  );
}
