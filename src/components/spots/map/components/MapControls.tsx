'use client';

import { Maximize2, Minimize2, MapPin, Layers, Wind, HelpCircle, CloudRain, RotateCcw, Waves, Zap, Anchor, Clock, LifeBuoy, Activity, Navigation } from 'lucide-react';

interface MapControlsProps {
  isFullscreen: boolean;
  isMobile: boolean;
  isHeroEmbed: boolean;
  clusterEnabled: boolean;
  showWindOnMarkers: boolean;
  windEnabled: boolean;
  radarEnabled: boolean;
  radarPrefSet: boolean;
  radarUnavailable: boolean;
  isobathsEnabled: boolean;
  onlyOnEnabled: boolean;
  coastalWarningsEnabled: boolean;
  // Labels
  clusterLabel: string;
  windLabel: string;
  windHint: string | null;
  radarLabel: string;
  radarHint: string;
  radarResetLabel: string;
  hoursEnabled: boolean;
  hoursUnavailable: boolean;
  hoursPrefSet: boolean;
  hoursLabel: string;
  hoursHint: string;
  hoursResetLabel: string;
  buoysEnabled: boolean;
  buoysLabel: string;
  buoysHint: string;
  hsEnabled: boolean;
  hsUnavailable: boolean;
  hsLabel: string;
  hsHint: string;
  currentsEnabled: boolean;
  currentsUnavailable: boolean;
  currentsLabel: string;
  currentsHint: string;
  isobathsLabel: string;
  onlyOnLabel: string;
  onlyOnHint: string;
  windLegendHelpLabel: string;
  coastalWarningsLabel: string;
  fullscreenLabel: string;
  exitLabel: string;
  // Handlers
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  toggleCluster: () => void;
  toggleWind: () => void;
  openWindLegend: () => void;
  toggleRadar: () => void;
  handleResetRadar: () => void;
  toggleHours: () => void;
  handleResetHours: () => void;
  toggleBuoys: () => void;
  toggleHs: () => void;
  toggleCurrents: () => void;
  toggleIsobaths: () => void;
  toggleOnlyOn: () => void;
  toggleCoastalWarnings: () => void;
  // Refs
  windButtonRef: React.Ref<HTMLButtonElement>;
  fullscreenBtnRef: React.Ref<HTMLButtonElement>;
}

const btnBase = 'flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-3 py-2 rounded-input border border-divider bg-bg-elevated text-fg text-xs font-semibold shadow-card hover:bg-surface-1/[0.04] transition-colors duration-150 touch-manipulation';
const btnActive = 'border-data-wind/40 bg-bg-elevated text-fg'; // opaque: readable over any tile
const btnMuted = 'border-divider bg-bg-elevated text-fg-muted opacity-80';
const btnRadarActive = 'border-data-waves/40 bg-data-waves/15 text-fg';
const btnRadarDisabled = 'border-divider bg-bg-elevated text-fg-subtle opacity-60 cursor-not-allowed';
const btnIsobathsActive = 'border-data-waves/40 bg-data-waves/15 text-fg';
const btnCurrentsActive = 'border-data-water/40 bg-data-water/15 text-fg';
const btnHoursActive = 'border-score-good/40 bg-score-good/15 text-fg';
const btnOnlyOnActive = btnHoursActive;
const iconBtnBase = 'flex items-center justify-center min-h-[36px] min-w-[36px] rounded-input border border-divider bg-bg-elevated text-fg-muted hover:bg-surface-1/[0.04] hover:text-fg transition-colors duration-150';

export default function MapControls({
  isFullscreen,
  isMobile,
  isHeroEmbed,
  clusterEnabled,
  showWindOnMarkers,
  windEnabled,
  radarEnabled,
  radarPrefSet,
  radarUnavailable,
  isobathsEnabled,
  onlyOnEnabled,
  coastalWarningsEnabled,
  clusterLabel,
  windLabel,
  windHint,
  radarLabel,
  radarHint,
  radarResetLabel,
  hoursEnabled,
  hoursUnavailable,
  hoursPrefSet,
  hoursLabel,
  hoursHint,
  hoursResetLabel,
  buoysEnabled,
  buoysLabel,
  buoysHint,
  hsEnabled,
  hsUnavailable,
  hsLabel,
  hsHint,
  currentsEnabled,
  currentsUnavailable,
  currentsLabel,
  currentsHint,
  isobathsLabel,
  onlyOnLabel,
  onlyOnHint,
  windLegendHelpLabel,
  coastalWarningsLabel,
  fullscreenLabel,
  exitLabel,
  enterFullscreen,
  exitFullscreen,
  toggleCluster,
  toggleWind,
  openWindLegend,
  toggleRadar,
  handleResetRadar,
  toggleHours,
  handleResetHours,
  toggleBuoys,
  toggleHs,
  toggleCurrents,
  toggleIsobaths,
  toggleOnlyOn,
  toggleCoastalWarnings,
  windButtonRef,
  fullscreenBtnRef,
}: MapControlsProps) {
  if (isHeroEmbed) return null;
  // Mobile fullscreen uses the bottom HUD; desktop keeps these labelled menus.
  if (isFullscreen && isMobile) return null;

  return (
    <div
      className="absolute top-3 left-3 z-[1000] flex max-h-[calc(100%-16rem)] flex-col gap-2 overflow-y-auto overscroll-contain [scrollbar-width:thin]"
      data-map-controls="true"
    >
      <button
        ref={fullscreenBtnRef}
        type="button"
        onClick={isFullscreen ? exitFullscreen : enterFullscreen}
        className={btnBase}
        aria-label={isFullscreen ? exitLabel : fullscreenLabel}
        aria-expanded={isFullscreen}
        data-map-exit-fullscreen={isFullscreen ? true : undefined}
      >
        {isFullscreen ? (
          <Minimize2 className="w-4 h-4 shrink-0" aria-hidden />
        ) : (
          <Maximize2 className="w-4 h-4 shrink-0" aria-hidden />
        )}
        <span className="hidden sm:inline">{isFullscreen ? exitLabel : 'Explorar'}</span>
      </button>

      <button
        type="button"
        onClick={toggleCluster}
        className={btnBase}
        aria-label={clusterLabel}
        aria-pressed={!clusterEnabled}
      >
        {clusterEnabled ? <MapPin className="w-4 h-4 shrink-0" aria-hidden /> : <Layers className="w-4 h-4 shrink-0" aria-hidden />}
        <span className="hidden sm:inline">{clusterLabel}</span>
      </button>

      <div className="inline-flex flex-col gap-1">
        <div className="inline-flex items-center gap-0.5">
          <button
            ref={windButtonRef}
            type="button"
            onClick={toggleWind}
            title={windHint ?? undefined}
            className={`${btnBase} ${showWindOnMarkers ? btnActive : windEnabled && clusterEnabled ? btnMuted : ''}`}
            aria-label={windLabel}
            aria-pressed={showWindOnMarkers}
          >
            <Wind className="w-4 h-4 shrink-0 text-data-wind" aria-hidden />
            <span className="hidden sm:inline">{windLabel}</span>
          </button>
          <button
            type="button"
            onClick={openWindLegend}
            className={iconBtnBase}
            aria-label={windLegendHelpLabel}
          >
            <HelpCircle className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="inline-flex flex-col gap-1">
        <div className="inline-flex items-center gap-0.5">
          <button
            type="button"
            onClick={toggleRadar}
            disabled={radarUnavailable}
            title={radarUnavailable ? `${radarHint} — indisponível` : radarHint}
            className={`${btnBase} ${radarUnavailable ? btnRadarDisabled : radarEnabled ? btnRadarActive : ''}`}
            aria-label={radarLabel}
            aria-pressed={radarEnabled}
          >
            <CloudRain className="w-4 h-4 shrink-0 text-data-waves" aria-hidden />
            <span className="hidden sm:inline">{radarLabel}</span>
          </button>
          {(radarPrefSet || radarEnabled) && (
            <button
              type="button"
              onClick={handleResetRadar}
              aria-label={radarResetLabel}
              title={radarResetLabel}
              className={`${iconBtnBase} touch-manipulation`}
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {isFullscreen && (
        <div className="inline-flex flex-col gap-1">
          <div className="inline-flex items-center gap-0.5">
            <button
              type="button"
              onClick={toggleHours}
              disabled={hoursUnavailable}
              title={hoursUnavailable ? `${hoursHint} — indisponível` : hoursHint}
              className={`${btnBase} ${hoursUnavailable ? btnRadarDisabled : hoursEnabled ? btnHoursActive : ''}`}
              aria-label={hoursLabel}
              aria-pressed={hoursEnabled}
              data-map-hours-toggle
            >
              <Clock className="w-4 h-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">{hoursLabel}</span>
            </button>
            {(hoursPrefSet || hoursEnabled) && (
              <button
                type="button"
                onClick={handleResetHours}
                aria-label={hoursResetLabel}
                title={hoursResetLabel}
                className={`${iconBtnBase} touch-manipulation`}
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden />
              </button>
            )}
          </div>
        </div>
      )}

      {isFullscreen && (
        <button
          type="button"
          onClick={toggleHs}
          disabled={hsUnavailable}
          title={hsUnavailable ? `${hsHint} — indisponível` : hsHint}
          className={`${btnBase} ${hsUnavailable ? btnRadarDisabled : hsEnabled ? btnIsobathsActive : ''}`}
          aria-label={hsLabel}
          aria-pressed={hsEnabled}
          data-map-hs-toggle
        >
          <Activity className="w-4 h-4 shrink-0" aria-hidden />
          <span className="hidden sm:inline">{hsLabel}</span>
        </button>
      )}

      {isFullscreen && (
        <button
          type="button"
          onClick={toggleCurrents}
          disabled={currentsUnavailable}
          title={currentsUnavailable ? `${currentsHint} — indisponível` : currentsHint}
          className={`${btnBase} ${currentsUnavailable ? btnRadarDisabled : currentsEnabled ? btnCurrentsActive : ''}`}
          aria-label={currentsLabel}
          aria-pressed={currentsEnabled}
          data-map-currents-toggle
        >
          <Navigation className="w-4 h-4 shrink-0 text-data-water" aria-hidden />
          <span className="hidden sm:inline">{currentsLabel}</span>
        </button>
      )}

      {isFullscreen && (
        <button
          type="button"
          onClick={toggleBuoys}
          title={buoysHint}
          className={`${btnBase} ${buoysEnabled ? btnIsobathsActive : ''}`}
          aria-label={buoysLabel}
          aria-pressed={buoysEnabled}
          data-map-buoys-toggle
        >
          <LifeBuoy className="w-4 h-4 shrink-0" aria-hidden />
          <span className="hidden sm:inline">{buoysLabel}</span>
        </button>
      )}

      <button
        type="button"
        onClick={toggleIsobaths}
        title="Mostrar/ocultar isóbatas 8/16/30 m"
        className={`${btnBase} ${isobathsEnabled ? btnIsobathsActive : ''}`}
        aria-label={isobathsLabel}
        aria-pressed={isobathsEnabled}
      >
        <Waves className="w-4 h-4 shrink-0 text-data-waves" aria-hidden />
        <span className="hidden sm:inline">{isobathsLabel}</span>
      </button>

      <button
        type="button"
        onClick={toggleCoastalWarnings}
        className={`${btnBase} ${coastalWarningsEnabled ? btnRadarActive : ''}`}
        aria-label={coastalWarningsLabel}
        aria-pressed={coastalWarningsEnabled}
      >
        <Anchor className="w-4 h-4 shrink-0 text-data-waves" aria-hidden />
        <span className="hidden sm:inline">{coastalWarningsLabel}</span>
      </button>

      <button
        type="button"
        onClick={toggleOnlyOn}
        title={onlyOnHint}
        className={`${btnBase} ${onlyOnEnabled ? btnOnlyOnActive : ''}`}
        aria-label={onlyOnLabel}
        aria-pressed={onlyOnEnabled}
      >
        <Zap className="w-4 h-4 shrink-0 text-score-good" aria-hidden />
        <span className="hidden sm:inline">{onlyOnLabel}</span>
      </button>
    </div>
  );
}
