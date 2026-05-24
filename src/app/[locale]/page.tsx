import { readFileSync } from 'fs';
import { join } from 'path';
import Link from 'next/link';
import { 
  MapPin, ArrowRight
} from 'lucide-react';
import { spots } from '@/lib/spots';
import { getAllSportScores, getScoreColor } from '@/lib/sportScore';
import type { SportType } from '@/lib/sportRatings';
import { getCompatibleSports, ALL_SPORTS } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import { getTranslation } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { getMacroRegion, MACRO_REGIONS } from '@/lib/regions';
import { SpotGridClient } from '@/components/spots/SpotGridClient';
import DawnPatrolBanner from '@/components/DawnPatrolBannerWrapper';
import HomepageSearch from '@/components/ui/HomepageSearch';
import { getScoreRgb } from '@/lib/map-constants';
import { truncateAtWord } from '@/lib/text';

// ─── Types ───
interface SpotData {
  spot: typeof spots[0];
  conditions: {
    waveHeight: number;
    wavePeriod: number;
    waveDirection: number;
    windSpeed: number;
    windDirection: number;
    windGust: number;
    waterTemp: number;
  };
  allScores: Record<SportType, SportScore>;
}

// ─── Load dawn-patrol.json at BUILD TIME ───
function loadDawnPatrol(): Record<string, any> | null {
  try {
    const filePath = join(process.cwd(), 'public', 'data', 'dawn-patrol.json');
    const data = readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

// ─── Load conditions at BUILD TIME (Server Component) ───
function loadConditions(): Record<string, any> {
  try {
    const filePath = join(process.cwd(), 'public', 'data', 'conditions.json');
    const data = readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.warn('Failed to load conditions.json:', e);
    return {};
  }
}

// ─── Server Component ───
export default async function HomePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams?: Promise<{ sport?: string; region?: string }> }) {
  const { locale } = await params;
  const isPt = locale === 'pt';
  const t = getTranslation(locale as Locale);

  // Load data at BUILD TIME - visible to Googlebot!
  const conditions = loadConditions();
  
  const spotsData: SpotData[] = [];
  for (const spot of spots) {
    const cond = conditions[spot.id];
    if (cond) {
      const conditionsData = {
        waveHeight: cond.waveHeight || 0,
        wavePeriod: cond.wavePeriod || 0,
        waveDirection: cond.waveDirection || 0,
        windSpeed: cond.windSpeed || 0,
        windDirection: cond.windDirection || 0,
        windGust: cond.windGust || 0,
        waterTemp: cond.waterTemp || 0,
      };
      const allScores = getAllSportScores(spot, conditionsData);
      spotsData.push({ spot, conditions: conditionsData, allScores });
    }
  }

  // Sort by surf score
  spotsData.sort((a, b) => (b.allScores['surf']?.score || 0) - (a.allScores['surf']?.score || 0));

  const bestSpot = spotsData[0];
  const top5 = spotsData.slice(0, 5);

  // FIX U1: Fallback spots for ticker when no conditions data
  const tickerSpots = top5.length > 0 ? top5 : (spots.slice(0, 5) as typeof spots).map(spot => ({
    spot,
    conditions: { waveHeight: 1.2, wavePeriod: 8, waveDirection: 270, windSpeed: 12, windDirection: 330, windGust: 18, waterTemp: 17 },
    allScores: { surf: { score: 70 }, kitesurf: { score: 65 }, windsurf: { score: 60 } } as Record<string, { score: number }>
  }));

  // "ON" threshold tuned empirically (Fase 4a): score >= 70
  // restricted to spot's compatibleSports. With current data,
  // this yields ~51 spots out of 72 with conditions (~71% of active).
  const ON_THRESHOLD = 70;

  const onCount = spotsData.filter(d => {
    const compatible = getCompatibleSports(d.spot);
    return compatible.some(sport => (d.allScores[sport]?.score ?? 0) >= ON_THRESHOLD);
  }).length;

  // Status bar: freshest and stalest timestamps
  const now = Date.now();
  const timestamps = spotsData
    .map(d => conditions[d.spot.id]?.updatedAt)
    .filter(Boolean)
    .map((ts: string) => new Date(ts).getTime());
  const maxTs = timestamps.length > 0 ? Math.max(...timestamps) : null;
  const minTs = timestamps.length > 0 ? Math.min(...timestamps) : null;
  const hoursSinceMin = minTs ? (now - minTs) / 3600000 : Infinity;

  // Dawn Patrol headline for context line
  const dawnPatrol = loadDawnPatrol();
  const dawnHeadline = dawnPatrol?.[isPt ? 'pt' : 'en']?.headline || null;

  // Best sport (for sub-line "Top score: X · surf")
  const bestSportEntry = bestSpot
    ? Object.entries(bestSpot.allScores)
        .filter(([, s]) => s.score > 0)
        .sort(([, a], [, b]) => b.score - a.score)[0]
    : null;
  const bestSportId = (bestSportEntry?.[0] as SportType) || 'surf';

  return (
    <div className="min-h-screen bg-bg-base">
      {/* SEO H1 - visible to Googlebot */}
      <h1 className="sr-only">
        {isPt 
          ? `VenTu - ${spotsData.length} spots de surf, kitesurf e windsurf com condições em tempo real`
          : `VenTu - ${spotsData.length} surf, kitesurf and windsurf spots with real-time conditions`
        }
      </h1>

      {/* Status Bar — sits below the fixed header (z-50), so its sticky
          offset has to be the header height (16) and its z-index must
          stay below the header to avoid covering the menu trigger. */}
      <section
        role="status"
        aria-live="polite"
        className="w-full bg-surface-1 border-b border-divider z-30 sticky top-16"
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-9 sm:h-10 flex items-center">
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-meta text-fg-muted min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                hoursSinceMin < 3
                  ? 'bg-[rgb(var(--score-good))]'
                  : hoursSinceMin < 12
                    ? 'bg-[rgb(var(--score-fair))]'
                    : 'bg-[rgb(var(--score-poor))]'
              } ${hoursSinceMin < 12 ? 'animate-pulse' : ''}`}
            />
            <span className="truncate">
              {minTs
                ? `${isPt ? 'Atualizado às' : 'Updated at'} ${new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(maxTs!))} · ${spotsData.length} ${isPt ? 'spots monitorizados' : 'spots monitored'}`
                : isPt ? 'Sem dados de condições' : 'No condition data'}
            </span>
          </div>
        </div>
      </section>

      {/* Dawn Patrol AI Advisor Banner */}
      <DawnPatrolBanner locale={locale} />

      {/* Live Ticker - FIX U1: with fallback */}
      {tickerSpots.length > 0 ? (
        <div
          className="w-full bg-surface-1 border-y border-divider overflow-x-auto scrollbar-hide"
          role="region"
          aria-label={isPt ? 'Spots em destaque' : 'Top spots'}
          aria-live="off"
        >
          <div className="edge-fade-x">
            <ul role="list" className="flex animate-marquee whitespace-nowrap motion-reduce:animate-none hover:[animation-play-state:paused]" style={{ animationDuration: '60s' }}>
              {[...tickerSpots, ...tickerSpots].map((data, i) => {
                const score = data.allScores?.['surf']?.score || 0;
                const color = getScoreRgb(score);
                // Second half is a visual duplicate for the marquee loop;
                // hide it from assistive tech to avoid double-reads.
                const isClone = i >= tickerSpots.length;
                return (
                  <li key={`${data.spot.id}-${i}`} className="inline-flex" aria-hidden={isClone || undefined}>
                    <Link
                      href={`/${locale}/spots/${data.spot.slug}/`}
                      className="inline-flex items-center gap-3 px-5 py-1.5 hover:bg-surface-2 transition-colors"
                      tabIndex={isClone ? -1 : 0}
                    >
                      <span className="w-0.5 h-4 rounded-full" style={{ backgroundColor: color }} />
                      <span className="font-sans font-semibold text-sm text-fg">{isPt ? data.spot.name : data.spot.nameEn}</span>
                      <span className="font-mono text-xs text-fg-subtle">{data.conditions.waveHeight.toFixed(1)}m · {(data.conditions.windSpeed * 1.94384).toFixed(0)}kt</span>
                      <span className="font-mono text-xs font-bold tabular-nums" style={{ color }}>{score}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : (
        <div className="w-full bg-surface-1 border-y border-divider px-4 py-2 text-center text-meta text-fg-muted">
          {isPt ? 'A carregar condições...' : 'Loading conditions...'}
        </div>
      )}

      {/* Hero Compact */}
      {bestSpot && (
        <section className="relative min-h-[30vh] md:min-h-[40vh] flex items-center justify-center overflow-hidden py-8 md:py-8 bg-bg-base">
          {/* Subtle radial glow — removed-motion safe */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgb(var(--score-good))_0%,transparent_70%)]" />
          </div>

          <div className="relative z-10 max-w-3xl mx-auto px-4 text-center space-y-6">
            {/* Context line */}
            <p className="text-meta-sm text-fg-subtle font-mono uppercase tracking-wider">
              {new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).replace(/^\w/, c => c.toUpperCase())}
              {dawnHeadline && ` · ${truncateAtWord(dawnHeadline, 50)}`}
            </p>

            {/* Headline */}
            <h2 className="text-display-xl font-sans text-fg tracking-tight">
              {onCount === 0
                ? (isPt ? '0 spots ON hoje — descobre os melhores próximos dias' : '0 spots ON today — discover the best in coming days')
                : onCount === 1
                  ? (isPt ? '1 spot ON para ti hoje' : '1 spot ON for you today')
                  : (isPt ? `${onCount} spots ON para ti hoje` : `${onCount} spots ON for you today`)}
            </h2>

            {/* Sub-line — links to best spot */}
            <p className="text-h3 text-fg-muted">
              {isPt ? 'Top score' : 'Top score'}:{' '}
              <Link href={`/${locale}/spots/${bestSpot.spot.slug}/`} className="underline decoration-dotted underline-offset-4 hover:text-fg transition-colors">
                {isPt ? bestSpot.spot.name : bestSpot.spot.nameEn}
              </Link>{' '}
              <span className="font-mono tabular-nums">{bestSpot.allScores[bestSportId]?.score || 0}/100</span>
              {' · '}
              <span className="sport-accent" data-sport={bestSportId}>
                {bestSportId === 'surf' ? 'Surf' : bestSportId === 'kitesurf' ? 'Kitesurf' : bestSportId === 'windsurf' ? 'Windsurf' : bestSportId === 'bodyboard' ? 'Bodyboard' : bestSportId === 'sup' ? 'SUP' : 'Wakeboard'}
              </span>
            </p>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <HomepageSearch locale={locale} />
              <Link
                href={`/${locale}/spots/`}
                className="inline-flex items-center justify-center gap-2 h-12 px-6 border border-divider rounded-full text-fg hover:bg-surface-2 transition-colors font-medium"
              >
                {isPt ? 'Ver todos' : 'View all'}
              </Link>
            </div>

            {/* Quick links removed — sport filters now live in SpotGridClient below */}
          </div>
        </section>
      )}

      {/* Filter Bar + Spot Grid - Client Component for interactivity */}
      <SpotGridClient 
        spotsData={spotsData} 
        locale={locale}
        regions={[...MACRO_REGIONS]}
        initialSport={undefined}
        initialRegion={undefined}
      />

      {/* Footer Stats — Semantic Refresh */}
      <section className="border-t border-divider py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <div className="font-mono text-num-lg text-fg">{spotsData.length}</div>
            <div className="text-meta-sm text-fg-subtle">
              {isPt ? 'Spots monitorados' : 'Spots monitored'}
            </div>
          </div>
          <div>
            <div className="font-mono text-num-lg text-fg">{ALL_SPORTS.length}</div>
            <div className="text-meta-sm text-fg-subtle">
              {isPt ? 'Desportos' : 'Sports'}
            </div>
          </div>
          <div>
            <div className="text-num-lg text-fg">Open-Meteo</div>
            <div className="text-meta-sm text-fg-subtle">
              {isPt ? 'Fonte de dados' : 'Data source'}
            </div>
          </div>
          <div>
            <div className="text-num-lg text-fg">MIT</div>
            <div className="text-meta-sm text-fg-subtle">
              {isPt ? 'Open source' : 'Open source'}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
