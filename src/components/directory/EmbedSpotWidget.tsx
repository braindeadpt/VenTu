'use client';

import { scoreToNota } from '@/lib/nota';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSpotBySlug, spots } from '@/lib/spots';
import { getScoreTokens } from '@/lib/sportScore';
import { allScoresComV6, notaV6DoSpot } from '@/lib/notaV6Agora';
import { rawToScoreInput } from '@/lib/scoreConditions';
import { SITE_URL } from '@/lib/site';
import { getTranslation } from '@/lib/i18n';
import { scoreTodos } from '@/lib/desportosV6';
import { SPORT_LABELS } from '@/lib/sportRatings';
import { janelaSeguinte, linhaDeNoite, type JanelaSeguinte } from '@/lib/noiteListas';
import { janelasDeNoite } from '@/lib/janelasNoiteCliente';
import type { JanelasCandidatasBySport } from '@/lib/bestWindowToday';
import { JanelaNoite, LuaNoite } from '@/components/ui/NoiteJanela';

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
  const d = getTranslation(isPt ? 'pt' : 'en').directory;

  const spot = useMemo(() => getSpotBySlug(slug) || spots.find((s) => s.id === slug), [slug]);
  const [score, setScore] = useState<number | null>(null);
  const [wave, setWave] = useState<string | null>(null);
  const [wind, setWind] = useState<string | null>(null);
  // Noite (opção A, 28/10): lua + próxima janela em vez de um número de dia
  const [noite, setNoite] = useState<{ janela: JanelaSeguinte | null } | null>(null);

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
        // kitesurf/surf do `notaV6` do pipeline (#218 PR 4), as outras no motor antigo (D5)
        const nv = notaV6DoSpot(spot, file as Record<string, unknown>);
        const sports = allScoresComV6(spot, input, nv);
        // a regra do «Todos» (#218, PR 6): o máximo das v6; SUP / wakeboard só num
        // spot sem v6 — nunca o máximo de dois motores (era o «4» de noite)
        const best = scoreTodos(spot, sports);
        const h = raw.swellHeight ?? raw.waveHeight;
        if (h != null) setWave(`${Number(h).toFixed(1)} m`);
        if (raw.windSpeed != null) setWind(`${(raw.windSpeed * 1.94384).toFixed(0)} kt`);
        if (linhaDeNoite({ spot, allScores: sports }, 'all')) {
          const nowMs = Date.now();
          return janelasDeNoite(spot, input, nv, nowMs)
            .catch(() => ({}) as JanelasCandidatasBySport)
            .then((w) => {
              if (cancelled) return;
              setNoite({ janela: janelaSeguinte({ spot, janelasNoiteBySport: w }, 'all', nowMs) });
              setScore(0);
            });
        }
        setScore(Number.isFinite(best) ? best : 0);
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
      <div data-embed-widget className="p-4 text-sm text-fg-muted">
        {d.spotNotFound}
      </div>
    );
  }

  const tokens = score != null ? getScoreTokens(score) : null;
  const spotHref = `${SITE_URL}/${lang}/spots/${spot.slug}/`;
  const name = school || (isPt ? spot.name : spot.nameEn);

  return (
    <div data-embed-widget className="box-border bg-bg-base text-fg p-2 font-sans">
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
              {[wave, wind].filter(Boolean).join(' · ') || d.conditionsLabel}
            </p>
          </div>
          {noite ? (
            <div className="shrink-0 flex flex-col items-center gap-1" data-noite="">
              <LuaNoite size={48} locale={lang} decorativa />
              <span className="text-meta-sm font-semibold uppercase tracking-[0.12em] text-fg">
                {getTranslation(lang).noite.rotulo}
              </span>
            </div>
          ) : score != null && tokens && (
            <div
              className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-mono font-bold text-lg tabular-nums border ${tokens.text} ${tokens.bg} ${tokens.border}`}
              aria-label={`${scoreToNota(score)}/10`}
            >
              {scoreToNota(score)}
            </div>
          )}
        </div>
        {noite ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-divider pt-2 text-meta-sm" data-noite-janela-embed="">
            {noite.janela ? (
              <span className="text-fg-muted">
                {getTranslation(lang).noite.proximaJanelaDe.replace(
                  '{sport}',
                  SPORT_LABELS[noite.janela.sport][lang],
                )}
              </span>
            ) : null}
            <JanelaNoite janela={noite.janela} locale={lang} />
          </p>
        ) : null}
        <p className="text-meta-sm text-fg-subtle mt-2">
          {name ? `via VenTu` : 'VenTu'} · {d.conditionsWord}
        </p>
      </a>
    </div>
  );
}
