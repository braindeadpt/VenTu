'use client';

import { useState } from 'react';
import { Anchor, ChevronDown, CloudRain, Filter, HelpCircle, Layers, MapPin, Minimize2, RotateCcw, Search, Waves, Wind, Zap } from 'lucide-react';
import FilterPill from '@/components/ui/FilterPill';
import MapControlButton from '@/components/ui/MapControlButton';
import { dispatchOpenSearch } from '@/lib/searchEvents';
import type { BasemapMode } from './MapLayerToggle';
import type { MapFullscreenHudProps } from './mapHudTypes';

export interface MapExploreHudProps extends MapFullscreenHudProps {
  basemapMode: BasemapMode;
  onBasemapChange: (mode: BasemapMode) => void;
  clusterEnabled: boolean;
  onToggleCluster: () => void;
  radarEnabled: boolean;
  onToggleRadar: () => void;
  radarLabel: string;
  radarHint: string;
  /** Reinício do radar — repõe a preferência ao default (off). Opcionais: o
   *  grid/SpotMapInteractive passam-nas explicitamente; os outros construtores
   *  de mapHud ficam com o default (sem botão). */
  radarResetVisible?: boolean;
  onResetRadar?: () => void;
  radarResetLabel?: string;
  isobathsEnabled: boolean;
  onToggleIsobaths: () => void;
  isobathsLabel: string;
  isobathsHint: string;
  coastalWarningsEnabled: boolean;
  onToggleCoastalWarnings: () => void;
  coastalWarningsLabel: string;
  coastalWarningsHint: string;
  windEnabled: boolean;
  showWindOnMarkers: boolean;
  onToggleWind: () => void;
  onlyOnEnabled: boolean;
  onToggleOnlyOn: () => void;
  onlyOnLabel: string;
  onlyOnHint: string;
  onExitFullscreen: () => void;
  windHint: string | null;
  exploreModeLabel: string;
  layerMapLabel: string;
  layerSatelliteLabel: string;
  clusterLabel: string;
  windLabel: string;
  exitLabel: string;
  windLegendHelpLabel: string;
  onOpenWindLegend: () => void;
  windButtonRef?: React.Ref<HTMLButtonElement>;
  collapseHudLabel: string;
  expandHudLabel: string;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Chip compacto da camada de boias no HUD (ligado ao BuoyLayerNotice).
   *  Opcional: só o SpotMapInteractive o passa; os outros construtores de
   *  mapHud ficam com o default (sem chip). */
  buoyChip?: React.ReactNode;
}

export default function MapExploreHud({
  visible = true,
  isPt,
  sports,
  regions,
  selectedSport,
  selectedRegion,
  spotCount,
  onSportChange,
  onRegionChange,
  onResetFilters,
  clearFiltersLabel,
  showClearFilters,
  difficulties,
  selectedDifficulty,
  onDifficultyChange,
  difficultyGroupLabel,
  basemapMode,
  onBasemapChange,
  clusterEnabled,
  onToggleCluster,
  radarEnabled,
  onToggleRadar,
  radarLabel,
  radarHint,
  isobathsEnabled,
  onToggleIsobaths,
  isobathsLabel,
  isobathsHint,
  coastalWarningsEnabled,
  onToggleCoastalWarnings,
  coastalWarningsLabel,
  coastalWarningsHint,
  windEnabled,
  showWindOnMarkers,
  onToggleWind,
  onlyOnEnabled,
  onToggleOnlyOn,
  onlyOnLabel,
  onlyOnHint,
  onExitFullscreen,
  windHint,
  exploreModeLabel,
  layerMapLabel,
  layerSatelliteLabel,
  clusterLabel,
  windLabel,
  exitLabel,
  windLegendHelpLabel,
  onOpenWindLegend,
  windButtonRef,
  collapseHudLabel,
  expandHudLabel,
  onCollapsedChange,
  radarResetVisible = false,
  onResetRadar = () => {},
  radarResetLabel = '',
  buoyChip,
}: MapExploreHudProps) {
  // Mobile: start collapsed (more map). Desktop: filters always open.
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(min-width: 768px)').matches;
  });

  if (!visible) return null;

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      onCollapsedChange?.(next);
      return next;
    });
  };

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-[1100] pointer-events-none pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      role="region"
      aria-label={isPt ? 'Modo explorar' : 'Explore mode'}
      data-map-hud-collapsed={collapsed ? 'true' : 'false'}
    >
      <div className="pointer-events-auto mx-2 sm:mx-3 rounded-card border border-divider bg-bg-elevated md:bg-bg-elevated/95 md:backdrop-blur-md shadow-card px-3 py-2 flex flex-col gap-2 sm:px-3.5 md:px-4 md:py-2.5">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="md:hidden flex flex-col items-center justify-center gap-1 w-full min-h-[44px] -mx-0.5 px-0.5 rounded-input hover:bg-surface-1/[0.04] transition-colors duration-150"
          aria-expanded={!collapsed}
          aria-label={collapsed ? expandHudLabel : collapseHudLabel}
        >
          <span className="w-8 h-1 rounded-full bg-fg-subtle/30" aria-hidden />
          <ChevronDown
            className={`w-4 h-4 text-fg-muted motion-reduce:transition-none transition-transform duration-200 ${
              collapsed ? '' : 'rotate-180'
            }`}
            aria-hidden
          />
        </button>

        <div className="flex items-center gap-2 min-h-[44px] flex-wrap">
          <span className="text-meta font-semibold text-fg shrink-0">
            {exploreModeLabel}
          </span>

          <span className="pill pill-ghost shrink-0 px-2 py-1 min-h-0 text-meta-sm md:hidden inline-flex">
            <span className="font-mono tabular-nums text-fg">{spotCount}</span>
            <span className="text-fg-muted ml-1">{isPt ? 'spots' : ''}</span>
          </span>

          <div
            className="flex rounded-input overflow-hidden border border-divider shrink-0 ml-auto sm:ml-0"
            role="radiogroup"
            aria-label={isPt ? 'Camadas' : 'Layers'}
          >
            {(['map', 'satellite'] as const).map((mode) => {
              const active = basemapMode === mode;
              const label = mode === 'map' ? layerMapLabel : layerSatelliteLabel;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={label}
                  onClick={() => onBasemapChange(mode)}
                  className={`px-2.5 sm:px-3 py-2 min-h-[44px] text-meta-sm font-semibold transition-colors duration-150 ${
                    active
                      ? 'bg-surface-2/[0.08] text-fg'
                      : 'bg-surface-1/[0.04] text-fg-muted hover:bg-surface-2/[0.08] hover:text-fg'
                  }`}
                >
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{mode === 'map' ? (isPt ? 'Mapa' : 'Map') : 'Sat'}</span>
                </button>
              );
            })}
          </div>

          <MapControlButton
            onClick={() => dispatchOpenSearch()}
            aria-label={isPt ? 'Pesquisar spots' : 'Search spots'}
          >
            <Search className="w-4 h-4" aria-hidden />
          </MapControlButton>

          <MapControlButton
            onClick={onToggleCluster}
            aria-label={clusterLabel}
            pressed={!clusterEnabled}
          >
            {clusterEnabled ? (
              <MapPin className="w-4 h-4" aria-hidden />
            ) : (
              <Layers className="w-4 h-4" aria-hidden />
            )}
          </MapControlButton>

          <MapControlButton
            onClick={onToggleRadar}
            aria-label={radarLabel}
            pressed={radarEnabled}
            title={radarHint}
            className={
              radarEnabled ? 'border-data-waves/40 bg-data-waves/15 text-fg' : undefined
            }
          >
            <CloudRain className="w-4 h-4 text-data-waves" aria-hidden />
          </MapControlButton>

          {radarResetVisible && (
            <MapControlButton
              onClick={onResetRadar}
              aria-label={radarResetLabel}
              title={radarResetLabel}
            >
              <RotateCcw className="w-4 h-4" aria-hidden />
            </MapControlButton>
          )}

          <MapControlButton
            onClick={onToggleIsobaths}
            aria-label={isobathsLabel}
            pressed={isobathsEnabled}
            title={isobathsHint}
            className={
              isobathsEnabled ? 'border-data-waves/40 bg-data-waves/15 text-fg' : undefined
            }
          >
            <Waves className="w-4 h-4 text-data-waves" aria-hidden />
          </MapControlButton>

          <MapControlButton
            onClick={onToggleCoastalWarnings}
            aria-label={coastalWarningsLabel}
            pressed={coastalWarningsEnabled}
            title={coastalWarningsHint}
            className={
              coastalWarningsEnabled ? 'border-score-poor/40 bg-score-poor/15 text-fg' : undefined
            }
          >
            <Anchor className="w-4 h-4 text-score-poor" aria-hidden />
          </MapControlButton>

          <div className="inline-flex items-center gap-0.5 shrink-0">
            <MapControlButton
              ref={windButtonRef}
              onClick={onToggleWind}
              aria-label={windLabel}
              pressed={showWindOnMarkers}
              title={windHint ?? undefined}
              className={
                showWindOnMarkers ? 'border-data-wind/40 bg-data-wind/15 text-fg' : undefined
              }
            >
              <Wind className="w-4 h-4 text-data-wind" aria-hidden />
            </MapControlButton>
            <button
              type="button"
              onClick={onOpenWindLegend}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-input border border-divider bg-surface-1/[0.04] text-fg-muted hover:bg-surface-2/[0.08] hover:text-fg transition-colors duration-150"
              aria-label={windLegendHelpLabel}
            >
              <HelpCircle className="w-4 h-4" aria-hidden />
            </button>
          </div>

          <MapControlButton
            onClick={onToggleOnlyOn}
            aria-label={onlyOnLabel}
            pressed={onlyOnEnabled}
            title={onlyOnHint}
            className={
              onlyOnEnabled ? 'border-score-good/40 bg-score-good/15 text-fg' : undefined
            }
          >
            <Zap className="w-4 h-4 text-score-good" aria-hidden />
          </MapControlButton>

          {buoyChip}

          <span className="pill pill-ghost shrink-0 px-2 py-1 min-h-0 text-meta-sm hidden sm:inline-flex">
            <span className="font-mono tabular-nums text-fg">{spotCount}</span>
            <span className="text-fg-muted ml-1">{isPt ? 'spots' : ''}</span>
          </span>

          <MapControlButton
            onClick={onExitFullscreen}
            aria-label={exitLabel}
            className="ml-auto sm:ml-0"
            data-map-exit-fullscreen
          >
            <Minimize2 className="w-4 h-4" aria-hidden />
          </MapControlButton>
        </div>

        <div className={`flex flex-col gap-2 ${collapsed ? 'hidden md:flex' : 'flex'}`}>
          <div
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x edge-fade-x-end pb-0.5"
            role="group"
            aria-label={isPt ? 'Modalidade' : 'Sport'}
          >
            {sports.map((sport) => {
              const active = selectedSport === sport.id;
              return (
                <FilterPill
                  key={sport.id}
                  active={active}
                  onClick={() => onSportChange(sport.id)}
                  icon={<span className={active ? sport.color : 'text-fg-muted'}>{sport.icon}</span>}
                  compact
                >
                  {sport.label}
                </FilterPill>
              );
            })}
          </div>

          <div
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x edge-fade-x-end pb-0.5"
            role="group"
            aria-label={difficultyGroupLabel}
          >
            {difficulties.map((level) => {
              const active = selectedDifficulty === level.id;
              return (
                <FilterPill
                  key={level.id}
                  compact
                  active={active}
                  onClick={() => onDifficultyChange(level.id)}
                >
                  {level.label}
                </FilterPill>
              );
            })}
          </div>

          <div className="flex items-center gap-2 min-h-[36px]">
            <div className="flex items-center gap-1 shrink-0 text-fg-muted">
              <Filter className="w-3.5 h-3.5" aria-hidden />
              <span className="text-meta-sm font-semibold uppercase tracking-wide">
                {isPt ? 'Região' : 'Region'}
              </span>
            </div>
            <div
              className="flex items-center gap-1 overflow-x-auto no-scrollbar touch-pan-x edge-fade-x-end flex-1 min-w-0"
              role="group"
              aria-label={isPt ? 'Região' : 'Region'}
            >
              {regions.map((region) => {
                const active = selectedRegion === region;
                return (
                  <FilterPill key={region} compact active={active} onClick={() => onRegionChange(region)}>
                    {region}
                  </FilterPill>
                );
              })}
            </div>
            {showClearFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded-input text-meta-sm font-medium text-fg-muted hover:text-fg hover:bg-surface-1/[0.04] transition-colors duration-150 min-h-[36px]"
                aria-label={clearFiltersLabel}
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden />
                <span className="hidden sm:inline">{clearFiltersLabel}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
