import { readFileSync } from 'fs';
import { join } from 'path';
import Link from 'next/link';
import { 
  MapPin, ArrowRight, Search
} from 'lucide-react';
import { spots } from '@/lib/spots';
import { getAllSportScores, getScoreColor } from '@/lib/sportScore';
import type { SportType } from '@/lib/sportRatings';
import { getCompatibleSports } from '@/lib/sportRatings';
import { getTranslation } from '@/lib/i18n';
import { getMacroRegion, MACRO_REGIONS } from '@/lib/regions';
import { SpotGridClient } from '@/components/spots/SpotGridClient';
import DawnPatrolBanner from '@/components/DawnPatrolBannerWrapper';

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
  allScores: Record<SportType, any>;
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
  const t = getTranslation(locale as any);

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

      {/* Status Bar */}
      <section role="status" aria-live="polite" className="w-full bg-surface-1 border-b border-divider z-30 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 h-10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-meta text-fg-muted">
            <span
              className={`w-2 h-2 rounded-full ${
                hoursSinceMin < 3
                  ? 'bg-[rgb(var(--score-good))]'
                  : hoursSinceMin < 12
                    ? 'bg-[rgb(var(--score-fair))]'
                    : 'bg-[rgb(var(--score-poor))]'
              } ${hoursSinceMin < 12 ? 'animate-pulse' : ''}`}
            />
            <span>
              {minTs
                ? `${isPt ? 'Atualizado às' : 'Updated at'} ${new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(maxTs!))} · ${spotsData.length} ${isPt ? 'spots monitorizados' : 'spots monitored'}`
                : isPt ? 'Sem dados de condições' : 'No condition data'}
            </span>
          </div>
        </div>
      </section>

      {/* Dawn Patrol AI Advisor Banner */}
      <DawnPatrolBanner locale={locale} />

      {/* Live Ticker - Refined */}
      <div className="w-full bg-surface-1 border-y border-divider overflow-hidden">
        <div className="flex animate-marquee whitespace-nowrap" style={{ animationDuration: '60s' }}>
          {[...top5, ...top5].map((data, i) => {
            const score = data.allScores['surf']?.score || 0;
            const color = score >= 85 ? 'rgb(var(--score-good))' : score >= 70 ? 'rgb(var(--score-fair))' : score >= 50 ? 'rgb(var(--score-mid))' : 'rgb(var(--score-poor))';
            return (
              <Link
                key={`${data.spot.id}-${i}`}
                href={`/${locale}/spots/${data.spot.slug}/`}
                className="inline-flex items-center gap-3 px-5 py-1.5 hover:bg-surface-2 transition-colors"
              >
                <span className="w-0.5 h-4 rounded-full" style={{ backgroundColor: color }} />
                <span className="font-sans font-semibold text-sm text-fg">{isPt ? data.spot.name : data.spot.nameEn}</span>
                <span className="font-mono text-xs text-fg-subtle">{data.conditions.waveHeight.toFixed(1)}m · {(data.conditions.windSpeed * 1.94384).toFixed(0)}kt</span>
                <span className="font-mono text-xs font-bold tabular-nums" style={{ color }}>{score}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Hero Compact */}
      {bestSpot && (
        <section className="relative min-h-[50vh] md:min-h-[40vh] flex items-center justify-center overflow-hidden py-12 md:py-8 bg-bg-base">
          {/* Subtle radial glow — removed-motion safe */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgb(var(--score-good))_0%,transparent_70%)]" />
          </div>

          <div className="relative z-10 max-w-3xl mx-auto px-4 text-center space-y-6">
            {/* Context line */}
            <p className="text-meta-sm text-fg-subtle font-mono uppercase tracking-wider">
              {new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).replace(/^\w/, c => c.toUpperCase())}
              {dawnHeadline && ` · ${dawnHeadline.slice(0, 50)}${dawnHeadline.length > 50 ? '…' : ''}`}
            </p>

            {/* Headline */}
            <h2 className="text-display-xl font-sans text-fg tracking-tight">
              {onCount === 0
                ? (isPt ? '0 spots ON hoje — descobre os melhores próximos dias' : '0 spots ON today — discover the best in coming days')
                : onCount === 1
                  ? (isPt ? '1 spot ON para ti hoje' : '1 spot ON for you today')
                  : (isPt ? `${onCount} spots ON para ti hoje` : `${onCount} spots ON for you today`)}
            </h2>

            {/* Sub-line */}
            <p className="text-h3 text-fg-muted">
              {isPt ? 'Top score' : 'Top score'}: {isPt ? bestSpot.spot.name : bestSpot.spot.nameEn}{' '}
              <span className="font-mono tabular-nums">{bestSpot.allScores[bestSportId]?.score || 0}/100</span>
              {' · '}
              <span className="sport-accent" data-sport={bestSportId}>
                {bestSportId === 'surf' ? 'Surf' : bestSportId === 'kitesurf' ? 'Kitesurf' : bestSportId === 'windsurf' ? 'Windsurf' : bestSportId === 'bodyboard' ? 'Bodyboard' : bestSportId === 'sup' ? 'SUP' : 'Wakeboard'}
              </span>
            </p>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                href={`/${locale}/spots/`}
                className="inline-flex items-center gap-2 w-full sm:w-auto h-12 px-4 bg-surface-1 border border-divider hover:border-divider-strong rounded-lg text-fg-subtle transition-colors"
              >
                <Search className="w-4 h-4 text-fg-muted" />
                <span>{isPt ? 'Procurar spot...' : 'Search spot...'}</span>
              </Link>
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
            <div className="font-mono text-num-lg text-fg">7</div>
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
