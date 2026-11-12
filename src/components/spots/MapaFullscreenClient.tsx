'use client';

import { localizedText } from '@/lib/localizedText';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Waves, Zap } from 'lucide-react';
import type { GridSpotData } from '@/lib/gridSpotFilters';
import { filterGridSpots } from '@/lib/gridSpotFilters';
import type { GridSportFilter } from '@/lib/sportRatings';
import {
  MAP_DIFFICULTY_LS_KEY,
  MAP_DIFFICULTY_OPTIONS,
  MAP_DIFFICULTY_CEILING_KEY,
  readMapDifficultyFromStorage,
  nivelFromUrlParam,
  spotMatchesDifficultyFilter,
  type MapDifficultyFilter,
} from '@/lib/mapDifficulty';
import { MAP_SPORT_FILTERS, getMapSportFilterLabel } from '@/lib/mapSportFilters';
import {
  DEFAULT_REGION,
  DEFAULT_SPORT,
  MAINLAND_REGION,
  readGridFiltersFromWindow,
  syncGridFiltersToUrl,
} from '@/lib/gridFilters';
import { dispatchSportChange, LS_SPORT_KEY, readSportFromStorage } from '@/lib/homepageSport';
import { unlockPageInteraction } from '@/lib/mapFullscreen';
import { setMapLayerUrlParam } from '@/lib/mapShareUrl';
import { getSpotDetailHref } from '@/lib/mapSpotDetail';
import { getTranslation } from '@/lib/i18n';
import { useLiveGridSpotData } from '@/hooks/useLiveGridSpotData';
import { parseDayParam, parseHourOfDayParam } from '@/lib/mapHours';
import { parseSpotListings } from '@/lib/spotListingsJson';
// Fase B (pele v6 «Atlântico»), PR B0: flag ?pele=v6 + tokens/fontes no âmbito [data-pele=v6].
import { useMapPele, useMapPeleBase } from '@/lib/mapPele';
import { MapPeleBaseFilter } from '@/components/spots/map/components/MapPeleBaseFilter';
import '@/styles/v6-fontes.css';
import '@/styles/mapa-pele-v6.css';
import '@/styles/mapa-pele-cabecalho.css';
import { useMapPeleCabecalho } from '@/lib/mapPeleCabecalho';

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
  { id: 'sup' as const, label: 'SUP', icon: <Waves className="w-4 h-4" />, color: 'text-sport-sup' },
  { id: 'wakeboard' as const, label: 'Wakeboard', icon: <Zap className="w-4 h-4" />, color: 'text-sport-wakeboard' },
];

function readMapSearchParams(): {
  radar: boolean;
  nauticalChart: boolean;
  hours: boolean;
  hourOfDay: number | null;
  day: number | null;
  buoys: boolean;
  hs: boolean;
  sst: boolean;
  currents: boolean;
  swell: boolean;
  wind: boolean;
  windOff: boolean;
  goesIr: boolean;
  storms: boolean;
  warnAreas: boolean;
  coastalWarnings: boolean;
  basemapSat: boolean;
  /** `?nivel=` partilhado: aplica-se só na visita (não grava a pref). */
  nivel: MapDifficultyFilter | undefined;
  spot: string | undefined;
  openSpotDetail: boolean;
  center: [number, number] | undefined;
  zoom: number | undefined;
} {
  const empty = {
    radar: false,
    nauticalChart: false,
    hours: false,
    hourOfDay: null,
    day: null,
    buoys: false,
    hs: false,
    sst: false,
    currents: false,
    swell: false,
    wind: false,
    windOff: false,
    goesIr: false,
    storms: false,
    warnAreas: false,
    coastalWarnings: false,
    basemapSat: false,
    nivel: undefined,
    spot: undefined,
    openSpotDetail: false,
    center: undefined,
    zoom: undefined,
  };
  if (typeof window === 'undefined') return empty;
  const params = new URLSearchParams(window.location.search);
  const hourOfDay = parseHourOfDayParam(params.get('t'));
  // #273 (home → /mapa): `?dia=0|1` só conta com `?t=`; `?de=home` só com `?spot=`.
  const day = hourOfDay != null ? parseDayParam(params.get('dia')) : null;
  const spot = params.get('spot') || undefined;
  const lat = Number.parseFloat(params.get('lat') ?? '');
  const lon = Number.parseFloat(params.get('lon') ?? '');
  const z = Number.parseFloat(params.get('z') ?? '');
  return {
    radar: params.get('radar') === '1',
    // «Carta náutica» (Fase 3): a key nova + as três legadas de partilha
    // antiga (?isobaths/?bathymetry/?seamarks=1) ligam o mesmo toggle.
    nauticalChart:
      params.get('nauticalChart') === '1' ||
      params.get('isobaths') === '1' ||
      params.get('bathymetry') === '1' ||
      params.get('seamarks') === '1',
    hours: params.get('hours') === '1' || hourOfDay != null,
    hourOfDay,
    day,
    buoys: params.get('buoys') === '1',
    // O Hs IDW saiu do menu: um ?hs=1 antigo abre a «Ondulação» (abaixo).
    hs: false,
    sst: params.get('sst') === '1',
    currents: params.get('currents') === '1',
    // «Ondulação» exclui a SST (as duas pintam o mar inteiro) e o vento
    // (selector «Vento | Ondulação | Nenhum»). Legado: ?hs=1 → «Ondulação».
    swell: params.get('swell') === '1' || (params.get('hs') === '1' && params.get('sst') !== '1'),
    wind: params.get('wind') === '1' && params.get('swell') !== '1',
    // «Nenhum» partilhado: ?wind=0 força o vento desligado (sem gravar a pref).
    windOff: params.get('wind') === '0',
    goesIr: params.get('goesIr') === '1',
    storms: params.get('storms') === '1',
    warnAreas: params.get('warnAreas') === '1',
    coastalWarnings: params.get('coastalWarnings') === '1',
    basemapSat: params.get('basemap') === 'sat',
    nivel: nivelFromUrlParam(params.get('nivel')),
    spot,
    openSpotDetail: params.get('de') === 'home' && !!spot,
    center:
      Number.isFinite(lat) && Number.isFinite(lon)
        ? ([lat, lon] as [number, number])
        : undefined,
    zoom: Number.isFinite(z) && z >= 3 && z <= 18 ? z : undefined,
  };
}

interface MapaFullscreenClientProps {
  /** Listagem dos spots serializada no servidor (ver serializeSpotListings). */
  spotsJson: string;
  regions: string[];
  locale: string;
}

export default function MapaFullscreenClient({
  spotsJson,
  regions,
  locale,
}: MapaFullscreenClientProps) {
  // Um JSON.parse nativo (TBT) — a mesma lista que antes chegava como props.
  const spotsData = useMemo(() => parseSpotListings<GridSpotData>(spotsJson), [spotsJson]);
  const router = useRouter();
  const isPt = locale === 'pt';
  const t = getTranslation(locale as 'pt' | 'en');
  // O mapa acrescenta a pseudo-região «Continente» (pill + select) logo a
  // seguir a «Todos» — as outras superfícies continuam com MACRO_REGIONS.
  const regionList = useMemo<readonly string[]>(() => {
    if (regions.includes(MAINLAND_REGION)) return regions;
    const i = regions.indexOf(DEFAULT_REGION);
    return i === -1
      ? [MAINLAND_REGION, ...regions]
      : [...regions.slice(0, i + 1), MAINLAND_REGION, ...regions.slice(i + 1)];
  }, [regions]);
  const liveSpotsData = useLiveGridSpotData(spotsData, { deferRefreshMs: 5000 });
  // Pele v6 (fase B): lida depois de montar; desligada = o /mapa de hoje, sem render extra.
  const pele = useMapPele();
  // B6 (D1): recolor da base «Mapa» atrás de ?pelebase=v6, só com a pele.
  const peleBase = useMapPeleBase(pele);
  // B8: o cabeçalho do site (fora deste contentor) veste os tokens v6 só com a pele.
  useMapPeleCabecalho(pele);

  const [sport, setSport] = useState<GridSportFilter>(DEFAULT_SPORT);
  const [region, setRegion] = useState<string>(DEFAULT_REGION);
  const [difficulty, setDifficulty] = useState<MapDifficultyFilter>('all');
  // Deep link ?radar=1 (botão de imersão do carrossel do radar): entra no mapa
  // com o radar já ligado. Só lido no arranque; o toggle manual continua a
  // mandar (o estado do mapa é dono do radar depois disto).
  const [initialRadar, setInitialRadar] = useState(false);
  const [initialNauticalChart, setInitialNauticalChart] = useState(false);
  const [initialHours, setInitialHours] = useState(false);
  const [initialHourOfDay, setInitialHourOfDay] = useState<number | null>(null);
  const [initialDay, setInitialDay] = useState<number | null>(null);
  const [initialBuoys, setInitialBuoys] = useState(false);
  const [initialHs, setInitialHs] = useState(false);
  const [initialSst, setInitialSst] = useState(false);
  const [initialCurrents, setInitialCurrents] = useState(false);
  const [initialSwell, setInitialSwell] = useState(false);
  const [initialWind, setInitialWind] = useState(false);
  const [initialWindOff, setInitialWindOff] = useState(false);
  const [initialGoesIr, setInitialGoesIr] = useState(false);
  const [initialStorms, setInitialStorms] = useState(false);
  const [initialWarnAreas, setInitialWarnAreas] = useState(false);
  const [initialCoastalWarnings, setInitialCoastalWarnings] = useState(false);
  const [initialBasemap, setInitialBasemap] = useState<'map' | 'satellite' | undefined>();
  const [focusSpotId, setFocusSpotId] = useState<string | undefined>();
  const [openSpotDetail, setOpenSpotDetail] = useState(false);
  const [initialCenter, setInitialCenter] = useState<[number, number] | undefined>();
  const [initialZoom, setInitialZoom] = useState<number | undefined>();

  // O mapa só monta DEPOIS de os deep links e filtros estarem capturados.
  // Antes, os props `initial*` chegavam por este layout effect e, ao reentrar
  // no /mapa por navegação client-side (chunk do mapa já resolvido), o filho
  // montava com os valores por omissão — vento, basemap, carta, IR, avisos,
  // tempestades, áreas e o estado do sheet ficavam presos ao default.
  const [paramsReady, setParamsReady] = useState(false);
  // StrictMode dev: o segundo mount não volta a capturar (o estado mantém-se).
  const deepLinksCapturedRef = useRef(false);
  // `?nivel=` do link partilhado: activo só nesta visita — enquanto true, a
  // pref de nível NÃO é gravada (como o ?wind=0). Uma mudança manual repõe
  // a persistência, como hoje.
  const nivelDoUrlRef = useRef(false);
  useLayoutEffect(() => {
    if (deepLinksCapturedRef.current) return;
    deepLinksCapturedRef.current = true;
    const s = readMapSearchParams();
    const { sport: urlSport, region: urlRegion } = readGridFiltersFromWindow(regionList);
    // Sem ?sport= o /mapa lembra a modalidade guardada (a mesma key da
    // homepage); o deep link vence sempre, mesmo ?sport=all.
    const hasSportParam = new URLSearchParams(window.location.search).has('sport');
    setSport(hasSportParam ? urlSport : readSportFromStorage());
    setRegion(urlRegion);
    nivelDoUrlRef.current = s.nivel != null;
    setDifficulty(s.nivel ?? readMapDifficultyFromStorage());
    setInitialRadar(s.radar);
    setInitialNauticalChart(s.nauticalChart);
    setInitialHours(s.hours);
    setInitialHourOfDay(s.hourOfDay);
    setInitialDay(s.day);
    setInitialBuoys(s.buoys);
    setInitialHs(s.hs);
    setInitialSst(s.sst);
    setInitialCurrents(s.currents);
    setInitialSwell(s.swell);
    setInitialWind(s.wind);
    setInitialWindOff(s.windOff);
    setInitialGoesIr(s.goesIr);
    setInitialStorms(s.storms);
    setInitialWarnAreas(s.warnAreas);
    setInitialCoastalWarnings(s.coastalWarnings);
    setInitialBasemap(s.basemapSat ? 'satellite' : undefined);
    setFocusSpotId(s.spot);
    setOpenSpotDetail(s.openSpotDetail);
    setInitialCenter(s.center);
    setInitialZoom(s.zoom);
    setParamsReady(true);
  }, [regionList]);

  useEffect(() => {
    // Antes da captura os valores são os defaults — gravar/sincronizar aqui
    // escrevia `sport=all` transitório no URL e no localStorage.
    if (!paramsReady) return;
    try {
      localStorage.setItem(LS_SPORT_KEY, sport);
      if (!nivelDoUrlRef.current) {
        localStorage.setItem(MAP_DIFFICULTY_LS_KEY, difficulty);
      }
    } catch {
      /* noop */
    }
    // Merge: só toca em sport/region — camadas, ?spot, ?lat/lon/z, ?t e
    // ?basemap ficam no URL.
    syncGridFiltersToUrl(sport, region, regionList);
    dispatchSportChange(sport);
  }, [paramsReady, sport, region, difficulty, regionList]);

  // Scroll lock for the fullscreen map page. The cleanup intentionally does
  // NOT unlock: reactStrictMode double-invokes effects in dev, and the
  // first mount's cleanup would undo the second mount's lock (the /mapa
  // footer would scroll back in). unlockPageInteraction() runs explicitly on
  // the exit path and via PageFadeGuard on route change instead.
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) unlockPageInteraction();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  const filtered = useMemo(() => {
    let list = filterGridSpots(liveSpotsData, sport, region);
    if (difficulty !== 'all') {
      const sportNivel = sport !== 'all' && sport !== 'big-wave' ? sport : undefined;
      list = list.filter((d) => spotMatchesDifficultyFilter(d.spot, difficulty, sportNivel));
    }
    return list;
  }, [liveSpotsData, sport, region, difficulty]);

  const handleSportChange = useCallback((next: GridSportFilter) => setSport(next), []);
  const handleRegionChange = useCallback((next: string) => setRegion(next), []);
  const handleDifficultyChange = useCallback((next: MapDifficultyFilter) => {
    // Escolha manual volta a gravar a pref — o ?nivel= era só da visita e
    // sai da barra (um refresh/cópia não reaplicava o nível antigo).
    if (nivelDoUrlRef.current) {
      nivelDoUrlRef.current = false;
      setMapLayerUrlParam('nivel', false);
    }
    setDifficulty(next);
  }, []);

  // «Limpar filtros» limpa região/território, nível (e «Só a bombar», no
  // componente) — a modalidade fica: é a escolha principal e tem o seu
  // próprio chip «×».
  const handleReset = useCallback(() => {
    if (nivelDoUrlRef.current) {
      nivelDoUrlRef.current = false;
      setMapLayerUrlParam('nivel', false);
    }
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

  const showClearFilters = region !== DEFAULT_REGION || difficulty !== 'all';

  const mapHud = {
    locale,
    sports: HUD_SPORTS.map((s) => ({
      id: s.id,
      label: getMapSportFilterLabel(s.id, locale, s.label),
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
    // Pele v6 (B2): o mesmo filtro com rótulos de tecto («Até intermédio») e o
    // «Nível · surf» por modalidade. Sem a pele, os rótulos de hoje.
    difficulties: MAP_DIFFICULTY_OPTIONS.map((d) => ({
      id: d.id,
      label: pele === 'v6'
        ? t.mapUiExplore[MAP_DIFFICULTY_CEILING_KEY[d.id]]
        : localizedText({ pt: d.labelPt, en: d.labelEn }, locale),
    })),
    selectedDifficulty: difficulty,
    onDifficultyChange: handleDifficultyChange,
    difficultyGroupLabel: pele === 'v6' && sport !== 'all' && sport !== 'big-wave'
      ? `${t.spotsMap.level} · ${getMapSportFilterLabel(sport, locale, HUD_SPORTS.find((h) => h.id === sport)?.label).toLocaleLowerCase(locale)}`
      : t.spotsMap.level,
    pele,
    peleBase,
    layersLabel: t.map.layersMenu,
  };

  return (
    <div
      className="relative h-[calc(100dvh-4rem)] w-full"
      aria-label={t.spotsMap.fullscreenMap}
      data-pele={pele ?? undefined}
      data-pele-base={peleBase ? 'v6' : undefined}
    >
      {peleBase ? <MapPeleBaseFilter /> : null}
      <h1 className="sr-only">{getTranslation(locale).pages.mapMetaTitle}</h1>
      {paramsReady ? (
      <SpotMapInteractive
        spotsData={filtered}
        fieldSpotsData={liveSpotsData}
        selectedSport={sport}
        selectedRegion={region}
        locale={locale}
        initialFullscreen
        initialRadarEnabled={initialRadar}
        initialNauticalChartEnabled={initialNauticalChart}
        initialHoursEnabled={initialHours}
        initialHourOfDay={initialHourOfDay}
        initialDay={initialDay}
        initialBuoysEnabled={initialBuoys}
        initialHsEnabled={initialHs}
        initialSstEnabled={initialSst}
        initialCurrentsEnabled={initialCurrents}
        initialSwellEnabled={initialSwell}
        initialWindEnabled={initialWind}
        initialWindDisabled={initialWindOff}
        initialGoesIrEnabled={initialGoesIr}
        initialStormsEnabled={initialStorms}
        initialWarnAreasEnabled={initialWarnAreas}
        initialCoastalWarningsEnabled={initialCoastalWarnings}
        initialBasemap={initialBasemap}
        focusSpotId={focusSpotId}
        openSpotDetail={openSpotDetail}
        initialCenter={initialCenter}
        initialZoom={initialZoom}
        fullscreenBelowHeader
        onExitFullscreen={handleExit}
        onSpotSelect={handleSpotSelect}
        mapHud={mapHud}
      />
      ) : (
        <div className="flex h-full min-h-[320px] items-center justify-center bg-surface-1/[0.04]">
          <div className="w-8 h-8 rounded-full border-2 border-data-waves/30 border-t-data-waves animate-spin" />
        </div>
      )}
    </div>
  );
}
