'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Waves, Zap } from 'lucide-react';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import { filterGridSpots } from '@/lib/gridSpotFilters';
import type { GridSportFilter } from '@/lib/sportRatings';
import {
  MAP_DIFFICULTY_LS_KEY,
  MAP_DIFFICULTY_OPTIONS,
  readMapDifficultyFromStorage,
  spotMatchesDifficultyFilter,
  type MapDifficultyFilter,
} from '@/lib/mapDifficulty';
import { MAP_SPORT_FILTERS } from '@/lib/mapSportFilters';
import {
  DEFAULT_REGION,
  DEFAULT_SPORT,
  readGridFiltersFromWindow,
  syncGridFiltersToUrl,
} from '@/lib/gridFilters';
import { dispatchSportChange, LS_SPORT_KEY } from '@/lib/homepageSport';
import { unlockPageInteraction } from '@/lib/mapFullscreen';
import { getSpotDetailHref } from '@/lib/mapSpotDetail';
import { getTranslation } from '@/lib/i18n';
import { useLiveGridSpotData } from '@/hooks/useLiveGridSpotData';

const SpotMapInteractive = dynamic(() => import('@/components/spots/SpotMapInteractive'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[320px] items-center justify-center bg-surface-1/[0.04]">
      <div className="w-8 h-8 rounded-full border-2 border-data-waves/30 border-t-data-waves animate-spin" />
    </div>
  ),
});

const HUD_SPORTS = [
  ...MAP_SPORT_FILTERS,
  { id: 'sup' as const, labelPt: 'SUP', labelEn: 'SUP', icon: <Waves className="w-4 h-4" />, color: 'text-sport-sup' },
  { id: 'wakeboard' as const, labelPt: 'Wakeboard', labelEn: 'Wakeboard', icon: <Zap className="w-4 h-4" />, color: 'text-sport-wakeboard' },
];

interface MapaFullscreenClientProps {
  spotsData: GridSpotData[];
  regions: string[];
  locale: string;
}

export default function MapaFullscreenClient({
  spotsData,
  regions,
  locale,
}: MapaFullscreenClientProps) {
  const router = useRouter();
  const isPt = locale === 'pt';
  const t = getTranslation(locale as 'pt' | 'en');
  const regionList = useMemo(() => regions as readonly string[], [regions]);
  const liveSpotsData = useLiveGridSpotData(spotsData, { deferRefreshMs: 5000 });

  const [sport, setSport] = useState<GridSportFilter>(DEFAULT_SPORT);
  const [region, setRegion] = useState<string>(DEFAULT_REGION);
  const [difficulty, setDifficulty] = useState<MapDifficultyFilter>('all');
  // Deep link ?radar=1 (botão de imersão do carrossel do radar): entra no mapa
  // com o radar já ligado. Só lido no arranque; o toggle manual continua a
  // mandar (o estado do mapa é dono do radar depois disto).
  const [initialRadar, setInitialRadar] = useState(false);
  // Deep link ?isobaths=1: entra no mapa com as isóbatas já ligadas (sobrepõe
  // a preferência persistida, como o radar) — útil para partilhar o overlay.
  const [initialIsobaths, setInitialIsobaths] = useState(false);
  // Deep link ?spot=<slug> (navegação da página de spot com aviso activo):
  // liga a camada de avisos à navegação e centra na área coberta (o estado fica
  // no SpotMapInteractive — decide com os dados se o spot está coberto).
  const [focusSpotId, setFocusSpotId] = useState<string | undefined>();
  // Deep link de imersão do spot (?radar=1&lat=&lon=, botão do carrossel da
  // página de spot): centra na REGIÃO do spot de origem em vez do centro
  // nacional. Coordenadas inválidas/ausentes → comportamento por omissão.
  const [initialCenter, setInitialCenter] = useState<[number, number] | undefined>();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInitialRadar(params.get('radar') === '1');
    setInitialIsobaths(params.get('isobaths') === '1');
    setFocusSpotId(params.get('spot') || undefined);
    const lat = Number.parseFloat(params.get('lat') ?? '');
    const lon = Number.parseFloat(params.get('lon') ?? '');
    setInitialCenter(
      Number.isFinite(lat) && Number.isFinite(lon)
        ? ([lat, lon] as [number, number])
        : undefined,
    );
  }, []);

  useEffect(() => {
    const { sport: urlSport, region: urlRegion } = readGridFiltersFromWindow(regionList);
    setSport(urlSport);
    setRegion(urlRegion);
    setDifficulty(readMapDifficultyFromStorage());
  }, [regionList]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_SPORT_KEY, sport);
      localStorage.setItem(MAP_DIFFICULTY_LS_KEY, difficulty);
    } catch {
      /* noop */
    }
    syncGridFiltersToUrl(sport, region, regionList);
    dispatchSportChange(sport);
  }, [sport, region, difficulty, regionList]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) unlockPageInteraction();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      unlockPageInteraction();
    };
  }, []);

  const filtered = useMemo(() => {
    let list = filterGridSpots(liveSpotsData, sport, region);
    if (difficulty !== 'all') {
      list = list.filter((d) => spotMatchesDifficultyFilter(d.spot, difficulty));
    }
    return list;
  }, [liveSpotsData, sport, region, difficulty]);

  const handleSportChange = useCallback((next: GridSportFilter) => setSport(next), []);
  const handleRegionChange = useCallback((next: string) => setRegion(next), []);
  const handleDifficultyChange = useCallback((next: MapDifficultyFilter) => setDifficulty(next), []);

  const handleReset = useCallback(() => {
    setSport(DEFAULT_SPORT);
    setRegion(DEFAULT_REGION);
    setDifficulty('all');
  }, []);

  const handleExit = useCallback(() => {
    unlockPageInteraction();
    router.push(`/${locale}/`);
  }, [router, locale]);

  const handleSpotSelect = useCallback(
    (spotId: string) => {
      const row = liveSpotsData.find((d) => d.spot.id === spotId);
      if (!row) return;
      const sportParam = sport !== 'all' && sport !== 'big-wave' ? sport : undefined;
      unlockPageInteraction();
      router.push(getSpotDetailHref(locale, row.spot.slug, sportParam));
    },
    [liveSpotsData, sport, locale, router],
  );

  const showClearFilters =
    sport !== DEFAULT_SPORT || region !== DEFAULT_REGION || difficulty !== 'all';

  const mapHud = {
    sports: HUD_SPORTS.map((s) => ({
      id: s.id,
      label: isPt ? s.labelPt : s.labelEn,
      icon: s.icon,
      color: s.color,
    })),
    regions: regionList,
    selectedSport: sport,
    selectedRegion: region,
    spotCount: filtered.length,
    onSportChange: handleSportChange,
    onRegionChange: handleRegionChange,
    onResetFilters: handleReset,
    clearFiltersLabel: t.hero.clearFilters,
    showClearFilters,
    difficulties: MAP_DIFFICULTY_OPTIONS.map((d) => ({
      id: d.id,
      label: isPt ? d.labelPt : d.labelEn,
    })),
    selectedDifficulty: difficulty,
    onDifficultyChange: handleDifficultyChange,
    difficultyGroupLabel: isPt ? 'Nível' : 'Level',
  };

  return (
    <div className="relative h-[calc(100dvh-4rem)] w-full" aria-label={isPt ? 'Mapa fullscreen' : 'Fullscreen map'}>
      <h1 className="sr-only">{isPt ? 'Mapa de spots — VenTu' : 'Spots map — VenTu'}</h1>
      <SpotMapInteractive
        spotsData={filtered}
        selectedSport={sport}
        selectedRegion={region}
        locale={locale}
        initialFullscreen
        initialRadarEnabled={initialRadar}
        initialIsobathsEnabled={initialIsobaths}
        focusSpotId={focusSpotId}
        initialCenter={initialCenter}
        fullscreenBelowHeader
        onExitFullscreen={handleExit}
        onSpotSelect={handleSpotSelect}
        mapHud={mapHud}
      />
    </div>
  );
}
