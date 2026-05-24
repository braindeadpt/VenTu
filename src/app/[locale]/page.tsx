import { readFileSync } from 'fs';
import { join } from 'path';
import { spots } from '@/lib/spots';
import { getAllSportScores } from '@/lib/sportScore';
import { ALL_SPORTS } from '@/lib/sportRatings';
import { getTranslation } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { MACRO_REGIONS } from '@/lib/regions';
import { SpotGridClient } from '@/components/spots/SpotGridClient';
import DawnPatrolBanner from '@/components/DawnPatrolBannerWrapper';
import HomepageFeatured from '@/components/homepage/HomepageFeatured';
import HomepageStatusBar from '@/components/homepage/HomepageStatusBar';
import { parseSportFilter, type HomepageSpotData } from '@/lib/homepageSport';

type SpotData = HomepageSpotData;

function loadDawnPatrol(): Record<string, any> | null {
  try {
    const filePath = join(process.cwd(), 'public', 'data', 'dawn-patrol.json');
    const data = readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

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

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isPt = locale === 'pt';
  getTranslation(locale as Locale);
  const initialSport = parseSportFilter(null);

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
        updatedAt: cond.updatedAt,
        source: 'real' as const,
      };
      const allScores = getAllSportScores(spot, conditionsData);
      spotsData.push({ spot, conditions: conditionsData, allScores });
    }
  }

  const dawnPatrol = loadDawnPatrol();
  const dawnHeadline = dawnPatrol?.[isPt ? 'pt' : 'en']?.headline || null;

  const now = Date.now();
  const timestamps = spotsData
    .map(d => conditions[d.spot.id]?.updatedAt)
    .filter(Boolean)
    .map((ts: string) => new Date(ts).getTime());
  const maxTs = timestamps.length > 0 ? Math.max(...timestamps) : null;
  const minTs = timestamps.length > 0 ? Math.min(...timestamps) : null;
  const hoursSinceMin = minTs ? (now - minTs) / 3600000 : Infinity;

  return (
    <div className="min-h-screen bg-bg-base">
      <h1 className="sr-only">
        {isPt
          ? `VenTu - ${spotsData.length} spots de surf, kitesurf e windsurf — condições actualizadas a cada 3 horas`
          : `VenTu - ${spotsData.length} surf, kitesurf and windsurf spots — conditions updated every 3 hours`}
      </h1>

      <HomepageStatusBar
        locale={locale}
        hoursSinceMin={hoursSinceMin}
        maxTs={maxTs}
        minTs={minTs}
        spotCount={spotsData.length}
      />

      <DawnPatrolBanner locale={locale} />

      <HomepageFeatured
        spotsData={spotsData}
        locale={locale}
        initialSport={initialSport}
        dawnHeadline={dawnHeadline}
      />

      <SpotGridClient
        spotsData={spotsData}
        locale={locale}
        regions={[...MACRO_REGIONS]}
      />

      <section className="border-t border-divider py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <dd className="font-mono text-num-lg text-fg">{spotsData.length}</dd>
              <dt className="text-meta-sm text-fg-subtle">{isPt ? 'Spots monitorizados' : 'Spots monitored'}</dt>
            </div>
            <div>
              <dd className="font-mono text-num-lg text-fg">{ALL_SPORTS.length}</dd>
              <dt className="text-meta-sm text-fg-subtle">{isPt ? 'Desportos' : 'Sports'}</dt>
            </div>
            <div>
              <dd className="text-num-lg text-fg">Open-Meteo</dd>
              <dt className="text-meta-sm text-fg-subtle">{isPt ? 'Fonte de dados' : 'Data source'}</dt>
            </div>
            <div>
              <dd className="text-num-lg text-fg">MIT</dd>
              <dt className="text-meta-sm text-fg-subtle">{isPt ? 'Open source' : 'Open source'}</dt>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
