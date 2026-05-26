'use client';

import { Filter, Layers, MapPin, Minimize2, RotateCcw, Wind } from 'lucide-react';
import FilterPill from '@/components/ui/FilterPill';
import type { BasemapMode } from './MapLayerToggle';
import type { MapFullscreenHudProps } from './MapFullscreenHud';

export interface MapExploreHudProps extends MapFullscreenHudProps {
  basemapMode: BasemapMode;
  onBasemapChange: (mode: BasemapMode) => void;
  clusterEnabled: boolean;
  onToggleCluster: () => void;
  windEnabled: boolean;
  showWindOnMarkers: boolean;
  onToggleWind: () => void;
  onExitFullscreen: () => void;
  windHint: string | null;
  exploreModeLabel: string;
  layerMapLabel: string;
  layerSatelliteLabel: string;
  clusterLabel: string;
  windLabel: string;
  exitLabel: string;
}

function activeSportLabel(
  sports: MapExploreHudProps['sports'],
  selectedSport: MapExploreHudProps['selectedSport'],
): string | null {
  return sports.find((s) => s.id === selectedSport)?.label ?? null;
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
  basemapMode,
  onBasemapChange,
  clusterEnabled,
  onToggleCluster,
  windEnabled,
  showWindOnMarkers,
  onToggleWind,
  onExitFullscreen,
  windHint,
  exploreModeLabel,
  layerMapLabel,
  layerSatelliteLabel,
  clusterLabel,
  windLabel,
  exitLabel,
}: MapExploreHudProps) {
  if (!visible) return null;

  const sportLabel = activeSportLabel(sports, selectedSport);

  return (
    <div
      className="absolute inset-0 z-[1000] pointer-events-none flex flex-col justify-between py-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      role="region"
      aria-label={isPt ? 'Modo explorar' : 'Explore mode'}
    >
      {/* Top toolbar */}
      <div className="pointer-events-auto mx-2 sm:mx-3 rounded-card border border-divider bg-bg-elevated/95 backdrop-blur-md shadow-card px-3 py-2 space-y-2">
        <div className="flex items-center gap-2 min-h-[44px]">
          <span className="text-meta font-semibold text-fg shrink-0 hidden sm:inline">
            {exploreModeLabel}
          </span>

          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto no-scrollbar edge-fade-x">
            {sportLabel && (
              <span className="pill pill-active shrink-0 px-2 py-1 min-h-0 text-meta-sm">
                {sportLabel}
              </span>
            )}
            <span className="pill pill-ghost shrink-0 px-2 py-1 min-h-0 text-meta-sm text-fg-muted">
              {selectedRegion}
            </span>
            <span className="pill pill-ghost shrink-0 px-2 py-1 min-h-0 text-meta-sm">
              <span className="font-mono tabular-nums text-fg">{spotCount}</span>
              <span className="text-fg-muted ml-1">{isPt ? 'spots' : ''}</span>
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <div
              className="flex rounded-input overflow-hidden border border-divider shrink-0"
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
                    className={`px-2 sm:px-2.5 py-2 min-h-[44px] text-meta-sm font-semibold transition-colors duration-150 ${
                      active
                        ? 'bg-surface-2 text-fg'
                        : 'bg-surface-1 text-fg-muted hover:bg-surface-2 hover:text-fg'
                    }`}
                  >
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">{mode === 'map' ? (isPt ? 'Mapa' : 'Map') : 'Sat'}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onToggleCluster}
              aria-label={clusterLabel}
              aria-pressed={!clusterEnabled}
              className={`flex items-center justify-center min-h-[44px] min-w-[44px] rounded-input border transition-colors duration-150 ${
                !clusterEnabled
                  ? 'border-divider-strong bg-surface-2 text-fg'
                  : 'border-divider bg-surface-1 text-fg-muted hover:bg-surface-2 hover:text-fg'
              }`}
            >
              {clusterEnabled ? (
                <MapPin className="w-4 h-4" aria-hidden />
              ) : (
                <Layers className="w-4 h-4" aria-hidden />
              )}
            </button>

            <button
              type="button"
              onClick={onToggleWind}
              aria-label={windLabel}
              aria-pressed={showWindOnMarkers}
              title={windHint ?? undefined}
              className={`flex items-center justify-center min-h-[44px] min-w-[44px] rounded-input border transition-colors duration-150 ${
                showWindOnMarkers
                  ? 'border-data-wind/40 bg-data-wind/15 text-fg'
                  : windEnabled && clusterEnabled
                    ? 'border-divider bg-surface-1 text-fg-muted opacity-80'
                    : 'border-divider bg-surface-1 text-fg-muted hover:bg-surface-2 hover:text-fg'
              }`}
            >
              <Wind className="w-4 h-4 text-data-wind" aria-hidden />
            </button>

            <button
              type="button"
              onClick={onExitFullscreen}
              aria-label={exitLabel}
              data-map-exit-fullscreen
              className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-input border border-divider bg-surface-1 text-fg hover:bg-surface-2 transition-colors duration-150"
            >
              <Minimize2 className="w-4 h-4" aria-hidden />
            </button>
          </div>
        </div>

        {windHint && (
          <p
            role="status"
            className="text-meta-sm text-score-fair px-1 py-0.5 border-t border-divider pt-2"
          >
            {windHint}
          </p>
        )}
      </div>

      {/* Bottom filters */}
      <div className="pointer-events-auto mx-2 sm:mx-3 rounded-card border border-divider bg-bg-elevated/95 backdrop-blur-md shadow-card px-2.5 py-2.5 flex flex-col gap-2">
        <div
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x edge-fade-x pb-0.5"
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

        <div className="flex items-center gap-2 min-h-[36px]">
          <div className="flex items-center gap-1 shrink-0 text-fg-muted">
            <Filter className="w-3.5 h-3.5" aria-hidden />
            <span className="text-meta-sm font-semibold uppercase tracking-wide">
              {isPt ? 'Região' : 'Region'}
            </span>
          </div>
          <div
            className="flex items-center gap-1 overflow-x-auto no-scrollbar touch-pan-x edge-fade-x flex-1 min-w-0"
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
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded-input text-meta-sm font-medium text-fg-muted hover:text-fg hover:bg-surface-1 transition-colors duration-150 min-h-[36px]"
              aria-label={clearFiltersLabel}
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden />
              <span className="hidden sm:inline">{clearFiltersLabel}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
