'use client';

/**
 * MapLayersZoneView — vista do compartimento «camadas» (dono M5):
 * indicadores de tiles, basemap flutuante, botões do hero e carrossel de
 * radar.
 *
 * Separado de MapLayersZone.tsx (M7-F): MapLayerToggle/RadarCarousel
 * avaliam-se num chunk próprio, carregado quando o mapa fica pronto —
 * fora da tarefa única de avaliação do chunk principal.
 */

import { useEffect, type CSSProperties } from 'react';
import { CloudRain, RotateCcw, Sailboat, SatelliteDish } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';
import {
  MAP_RASTER_OFF_EVENT,
  type MapHeavyRasterKey,
} from '@/lib/mapLayerBus';
import type { BasemapLoadState } from '@/lib/map-constants';
import type { IpmaRadarData } from '@/lib/ipmaRadar';
import {
  goesIrFrameClock,
  goesIrFrameFullClock,
  GOES_IR_CADENCE_MIN,
  GOES_IR_STALE_MAX_AGE_MIN,
} from '@/lib/goesIr';
import { MTG_SAT_CADENCE_MIN, MTG_SAT_STALE_MAX_AGE_MIN } from '@/lib/mtgSat';
import MapLayerToggle from '../../MapLayerToggle';
import type { BasemapMode } from '../../MapLayerToggle';
import RadarCarousel from '../../RadarCarousel';
import type { getTranslation } from '@/lib/i18n';

type MapTranslation = ReturnType<typeof getTranslation>;

interface MapLayersZoneProps {
  t: MapTranslation;
  locale: string;
  isFullscreen: boolean;
  isHeroEmbed: boolean;
  isMobile: boolean;
  // Tiles do basemap
  tileState: BasemapLoadState;
  retryBasemap: () => void;
  refreshLabel: string;
  basemapMode: BasemapMode;
  onBasemapChange: (mode: BasemapMode) => void;
  // Botões de camada do hero (embed da homepage)
  radarLabel: string;
  radarEnabled: boolean;
  radarPrefSet: boolean;
  radarResetLabel: string;
  toggleRadar: () => void;
  handleResetRadar: () => void;
  nauticalChartEnabled: boolean;
  nauticalChartLabel: string;
  nauticalChartHint: string;
  toggleNauticalChart: () => void;
  // Carrossel de radar
  radarData: IpmaRadarData | null | undefined;
  radarFrameList: Array<{ url: string; frameTime: string | null }>;
  radarFrameIndex: number;
  radarBusyCount: number;
  radarUserPaused: boolean;
  radarAttributionLabel: string;
  radarScrubbing: boolean;
  hoursOn: boolean;
  panelCollapsed: boolean;
  handleRadarFrameChange: (index: number) => void;
  handleRadarUserPausedChange: (paused: boolean) => void;
  handleRadarImmersionOpen: () => void;
  // Carrossel de satélite IR (MTG-I1 com fallback GOES-East, 10 min) —
  // mesmo componente do radar.
  goesIrEnabled: boolean;
  goesIrFrameList: Array<{ url: string; frameTime: string }>;
  goesIrFrameIndex: number;
  goesIrUserPaused: boolean;
  goesIrSource: 'mtg' | 'gibs';
  handleGoesIrFrameChange: (index: number) => void;
  handleGoesIrUserPausedChange: (paused: boolean) => void;
}

export default function MapLayersZone({
  t,
  locale,
  isFullscreen,
  isHeroEmbed,
  isMobile,
  tileState,
  retryBasemap,
  refreshLabel,
  basemapMode,
  onBasemapChange,
  radarLabel,
  radarEnabled,
  radarPrefSet,
  radarResetLabel,
  toggleRadar,
  handleResetRadar,
  nauticalChartEnabled,
  nauticalChartLabel,
  nauticalChartHint,
  toggleNauticalChart,
  radarData,
  radarFrameList,
  radarFrameIndex,
  radarBusyCount,
  radarUserPaused,
  radarAttributionLabel,
  radarScrubbing,
  hoursOn,
  panelCollapsed,
  handleRadarFrameChange,
  handleRadarUserPausedChange,
  handleRadarImmersionOpen,
  goesIrEnabled,
  goesIrFrameList,
  goesIrFrameIndex,
  goesIrUserPaused,
  goesIrSource,
  handleGoesIrFrameChange,
  handleGoesIrUserPausedChange,
}: MapLayersZoneProps) {
  // §8 — toast do limite de raster pesadas: o cap em useMapLayers emite
  // `ventu:map-raster-off` e aqui mostra-se «X desligado para manter o mapa
  // fluido» localizado (o toast é a única superfície React do evento).
  const { showToast } = useToast();

  // Carrosséis de radar/IR no ecrã inteiro.
  //  • Mobile: colados ao topo VISÍVEL do sheet via `--sheet-lift` (publicado
  //    pelo MapExploreSheet em cada snap/arrasto, já com +12 px de respiro) e
  //    com a mesma duração de snap — antes usavam uma medida única feita
  //    antes de o sheet existir e ficavam por baixo dele (z-1000 < z-1100).
  //  • Desktop: à direita do painel via `--map-panel-offset` (publicado pelo
  //    MapSpotPanel) em vez do literal 364 px, que deixava 4 px tapados.
  const fullscreenCarouselStyle = (extraBottom: number): CSSProperties =>
    isMobile
      ? {
          bottom: `calc(max(var(--sheet-lift, 0px), 32px) + ${extraBottom}px)`,
          left: 8,
          transition: 'bottom var(--sheet-snap-ms, 0ms) cubic-bezier(0.32,0.72,0,1)',
        }
      : {
          bottom: 32 + extraBottom,
          left: panelCollapsed ? 64 : 'var(--map-panel-offset, 380px)',
        };
  useEffect(() => {
    const onRasterOff = (e: Event) => {
      const key = (e as CustomEvent<{ key: MapHeavyRasterKey }>).detail?.key;
      if (!key) return;
      const names: Record<MapHeavyRasterKey, string> = {
        radar: t.mapUiLayers.layerRadar,
        nauticalChart: t.mapUiLayers.layerNauticalChart,
        goesIr: t.mapUiLayers.layerSatelliteIr,
      };
      showToast(t.mapUiLayers.rasterCapToast.replace('{layer}', names[key]));
    };
    window.addEventListener(MAP_RASTER_OFF_EVENT, onRasterOff);
    return () => window.removeEventListener(MAP_RASTER_OFF_EVENT, onRasterOff);
  }, [showToast, t]);

  return (
    <>
      {tileState === 'loading' && (
        <div
          role="status"
          aria-live="polite"
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[1002] flex items-center gap-2 rounded-full border border-divider bg-bg-elevated/90 backdrop-blur-sm px-3 py-1.5 shadow-card pointer-events-none"
        >
          <span
            className="w-3.5 h-3.5 rounded-full border-2 border-data-waves/30 border-t-data-waves animate-spin"
            aria-hidden
          />
          <span className="text-meta-sm text-fg-muted">{t.map.loading}</span>
        </div>
      )}

      {tileState === 'failed' && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-[1002] flex justify-center px-4 pointer-events-none">
          <div
            role="alert"
            className="pointer-events-auto flex flex-col items-center gap-2.5 rounded-card border border-divider bg-bg-elevated shadow-card px-5 py-4 max-w-xs text-center"
          >
            <p className="text-meta-sm font-semibold text-fg">{t.map.mapUnavailable}</p>
            <button
              type="button"
              onClick={retryBasemap}
              className="inline-flex items-center gap-1.5 rounded-input border border-divider bg-surface-1/[0.06] px-3 py-1.5 text-meta-sm font-semibold text-fg hover:bg-surface-1/[0.12] transition-colors duration-150 touch-manipulation"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden />
              {refreshLabel}
            </button>
          </div>
        </div>
      )}

      {!isFullscreen && !isHeroEmbed && (
        <MapLayerToggle current={basemapMode} onChange={onBasemapChange} locale={locale} />
      )}

      {isHeroEmbed && (
        <>
          <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 pointer-events-auto">
            <button type="button" onClick={toggleRadar} aria-label={radarLabel} aria-pressed={radarEnabled} className="inline-flex min-h-[44px] min-w-[44px] justify-center items-center gap-1.5 px-2.5 py-1.5 rounded-md text-meta-sm font-medium text-fg bg-bg-elevated/90 border border-divider shadow-card backdrop-blur-sm hover:bg-bg-elevated transition-colors">
              <CloudRain className="w-3.5 h-3.5 text-data-waves" aria-hidden />
              <span className="hidden sm:inline">{radarLabel}</span>
            </button>
            {(radarPrefSet || radarEnabled) && (
              <button type="button" onClick={handleResetRadar} aria-label={radarResetLabel} title={radarResetLabel} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center w-8 h-8 rounded-md text-meta-sm font-medium text-fg bg-bg-elevated/90 border border-divider shadow-card backdrop-blur-sm hover:bg-bg-elevated transition-colors">
                <RotateCcw className="w-3.5 h-3.5" aria-hidden />
              </button>
            )}
          </div>
          <button type="button" onClick={toggleNauticalChart} aria-label={nauticalChartLabel} title={nauticalChartHint} aria-pressed={nauticalChartEnabled} className="absolute top-[70px] right-3 z-[1000] inline-flex min-h-[44px] min-w-[44px] justify-center items-center gap-1.5 px-2.5 py-1.5 rounded-md text-meta-sm font-medium text-fg bg-bg-elevated/90 border border-divider shadow-card backdrop-blur-sm hover:bg-bg-elevated transition-colors pointer-events-auto">
            <Sailboat className="w-3.5 h-3.5 text-data-water" aria-hidden />
            <span className="hidden sm:inline">{nauticalChartLabel}</span>
          </button>
        </>
      )}

      {radarEnabled && radarData && (
        <RadarCarousel
          className={isHeroEmbed ? 'absolute bottom-20 right-3 z-[1000] pointer-events-auto' : isFullscreen ? 'absolute z-[1000]' : 'absolute bottom-8 left-2 sm:left-auto sm:right-2 z-[1000] max-w-[min(100%,320px)] sm:max-w-none'}
          style={isFullscreen ? fullscreenCarouselStyle(0) : undefined}
          frames={radarFrameList}
          frameIndex={radarFrameIndex}
          onFrameChange={handleRadarFrameChange}
          mapBusyCount={radarBusyCount}
          userPaused={radarUserPaused || hoursOn}
          onUserPausedChange={handleRadarUserPausedChange}
          labels={{ badge: t.map.radarBadge, hint: t.map.radarHint, scrub: t.map.radarScrub, play: t.map.radarPlay, pause: t.map.radarPause, paused: t.map.radarPaused, ipmaAttribution: radarAttributionLabel, gap: t.map.radarGap, stale: t.map.radarStale }}
          fullscreenHref={isFullscreen ? undefined : `/${locale}/mapa/?radar=1`}
          fullscreenLabel={t.map.radarFullscreen}
          onFullscreenOpen={handleRadarImmersionOpen}
          hideScrubber={isFullscreen}
          externalScrubbing={radarScrubbing}
        />
      )}

      {goesIrEnabled && goesIrFrameList.length > 0 && (
        <RadarCarousel
          className={isHeroEmbed ? 'absolute bottom-20 right-3 z-[1000] pointer-events-auto' : isFullscreen ? 'absolute z-[1000]' : 'absolute bottom-8 left-2 sm:left-auto sm:right-2 z-[1000] max-w-[min(100%,320px)] sm:max-w-none'}
          style={{
            // Com o radar também ligado, o badge do IR sobe ~84 px para não
            // o tapar (o cap de raster permite as duas em simultâneo).
            ...(isFullscreen
              ? fullscreenCarouselStyle(radarEnabled ? 84 : 0)
              : { bottom: radarEnabled ? 104 : undefined }),
          }}
          frames={goesIrFrameList}
          frameIndex={goesIrFrameIndex}
          onFrameChange={handleGoesIrFrameChange}
          mapBusyCount={radarBusyCount}
          userPaused={goesIrUserPaused}
          onUserPausedChange={handleGoesIrUserPausedChange}
          labels={{
            badge: t.map.satIrBadge,
            hint: t.map.satIrHint,
            scrub: t.map.radarScrub,
            play: t.map.radarPlay,
            pause: t.map.radarPause,
            paused: t.map.radarPaused,
            ipmaAttribution: '',
            gap: t.map.radarGap,
            stale: t.map.radarStale,
          }}
          icon={<SatelliteDish className="w-3.5 h-3.5 text-data-period" aria-hidden />}
          cadenceMin={goesIrSource === 'mtg' ? MTG_SAT_CADENCE_MIN : GOES_IR_CADENCE_MIN}
          staleMaxAgeMin={goesIrSource === 'mtg' ? MTG_SAT_STALE_MAX_AGE_MIN : GOES_IR_STALE_MAX_AGE_MIN}
          frameClock={goesIrFrameClock}
          frameFullClock={goesIrFrameFullClock}
          attribution={(
            <>
              {goesIrSource === 'mtg' ? (
                <a
                  href="https://www.eumetsat.int"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pointer-events-auto underline hover:text-fg transition-colors"
                >
                  MTG-I1 © EUMETSAT
                </a>
              ) : (
                <a
                  href="https://earthdata.nasa.gov/gibs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pointer-events-auto underline hover:text-fg transition-colors"
                >
                  GOES-East © NASA GIBS
                </a>
              )}
            </>
          )}
          // O HUD do fullscreen só é dono do scrubber do RADAR — o IR
          // mantém o seu flutuante (play + régua) em todas as superfícies.
          // Sem isto, com o IR ligado no /mapa não havia como pausar nem
          // mudar de frame. (O Open-Meteo não é fonte do satélite — saiu
          // dos créditos do IR.)
          hideScrubber={false}
        />
      )}
    </>
  );
}
