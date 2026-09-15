'use client';

import { Maximize2, Minimize2, MapPin, Layers, Wind, HelpCircle, CloudRain, RotateCcw, Waves, Zap, Anchor, Clock, LifeBuoy, Activity, Navigation, Thermometer } from 'lucide-react';

interface MapControlsProps {
  isFullscreen: boolean;
  isMobile: boolean;
  isHeroEmbed: boolean;
  clusterEnabled: boolean;
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
  sstEnabled: boolean;
  sstUnavailable: boolean;
  sstLabel: string;
  sstHint: string;
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
  toggleSst: () => void;
  toggleCurrents: () => void;
  toggleIsobaths: () => void;
  toggleOnlyOn: () => void;
  toggleCoastalWarnings: () => void;
  // Refs
  windButtonRef: React.Ref<HTMLButtonElement>;
  fullscreenBtnRef: React.Ref<HTMLButtonElement>;
}

/**
 * Item da toolbar — chip ghost dentro do pill: sem borda própria, hover
 * discreto, tinta do token da camada quando activo. h-10 (40px) dentro do
 * pill p-1.5 → barra de ~52px; labels escondidas em ecrãs estreitos.
 */
const item =
  'flex h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap text-fg-muted hover:text-fg hover:bg-surface-2/[0.08] transition-colors duration-150 touch-manipulation';
const itemLabel = 'hidden 2xl:inline';
const itemDisabled = 'opacity-40 cursor-not-allowed';
const active = {
  wind: 'bg-data-wind/10 text-data-wind',
  radar: 'bg-data-waves/10 text-data-waves',
  hours: 'bg-score-good/10 text-score-good',
  waves: 'bg-data-waves/10 text-data-waves',
  water: 'bg-data-water/10 text-data-water',
  period: 'bg-data-period/10 text-data-period',
  good: 'bg-score-good/10 text-score-good',
};
const iconBtn = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg-subtle hover:text-fg hover:bg-surface-2/[0.08] transition-colors duration-150';
const divider = <div className="mx-1 h-5 w-px shrink-0 bg-divider" aria-hidden />;

export default function MapControls({
  isFullscreen,
  isMobile,
  isHeroEmbed,
  clusterEnabled,
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
  sstEnabled,
  sstUnavailable,
  sstLabel,
  sstHint,
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
  toggleSst,
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
    // Barra de ferramentas flutuante no topo do mapa (padrão Windy/Maps):
    // um único pill centrado — primários com etiqueta à esquerda, camadas de
    // dados ao centro, «Só a bombar» à direita. Em larguras estreitas rola na
    // horizontal sem scrollbar visível; em <sm encolhe para não cobrir o zoom.
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-[1200] isolation-isolate max-w-[calc(100%-5rem)] max-sm:max-w-[calc(100%-8.5rem)]"
      data-map-controls="true"
    >
      <div className="flex items-center gap-0.5 overflow-x-auto overscroll-x-contain rounded-full border border-divider bg-bg-elevated p-1.5 shadow-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Primário */}
        <button
          ref={fullscreenBtnRef}
          type="button"
          onClick={isFullscreen ? exitFullscreen : enterFullscreen}
          className={item}
          aria-label={isFullscreen ? exitLabel : fullscreenLabel}
          title={isFullscreen ? exitLabel : fullscreenLabel}
          aria-expanded={isFullscreen}
          data-map-exit-fullscreen={isFullscreen ? true : undefined}
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4 shrink-0" aria-hidden />
          ) : (
            <Maximize2 className="w-4 h-4 shrink-0" aria-hidden />
          )}
        </button>

        <button
          type="button"
          onClick={toggleCluster}
          className={`${item} text-fg`}
          aria-label={clusterLabel}
          title={clusterLabel}
          aria-pressed={!clusterEnabled}
        >
          {clusterEnabled ? <MapPin className="w-4 h-4 shrink-0" aria-hidden /> : <Layers className="w-4 h-4 shrink-0" aria-hidden />}
          <span className="hidden lg:inline">{clusterLabel}</span>
        </button>

        <button
          ref={windButtonRef}
          type="button"
          onClick={toggleWind}
          title={windHint ?? windLabel}
          className={`${item} ${windEnabled ? active.wind : 'text-fg'}`}
          aria-label={windLabel}
          aria-pressed={windEnabled}
        >
          <Wind className="w-4 h-4 shrink-0" aria-hidden />
          <span className="hidden lg:inline">{windLabel}</span>
        </button>
        <button
          type="button"
          onClick={openWindLegend}
          className={iconBtn}
          aria-label={windLegendHelpLabel}
          title={windLegendHelpLabel}
        >
          <HelpCircle className="w-3.5 h-3.5" aria-hidden />
        </button>

        {divider}

        {/* Camadas de dados */}
        <button
          type="button"
          onClick={toggleRadar}
          disabled={radarUnavailable}
          title={radarUnavailable ? `${radarHint} — indisponível` : radarHint}
          className={`${item} ${radarUnavailable ? itemDisabled : radarEnabled ? active.radar : ''}`}
          aria-label={radarLabel}
          aria-pressed={radarEnabled}
          data-map-radar-toggle
        >
          <CloudRain className="w-4 h-4 shrink-0" aria-hidden />
          <span className={itemLabel}>{radarLabel}</span>
        </button>
        {(radarPrefSet || radarEnabled) && (
          <button
            type="button"
            onClick={handleResetRadar}
            aria-label={radarResetLabel}
            title={radarResetLabel}
            className={`${iconBtn} touch-manipulation`}
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden />
          </button>
        )}

        {isFullscreen && (
          <button
            type="button"
            onClick={toggleHours}
            disabled={hoursUnavailable}
            title={hoursUnavailable ? `${hoursHint} — indisponível` : hoursHint}
            className={`${item} ${hoursUnavailable ? itemDisabled : hoursEnabled ? active.hours : ''}`}
            aria-label={hoursLabel}
            aria-pressed={hoursEnabled}
            data-map-hours-toggle
          >
            <Clock className="w-4 h-4 shrink-0" aria-hidden />
            <span className={itemLabel}>{hoursLabel}</span>
          </button>
        )}
        {isFullscreen && (hoursPrefSet || hoursEnabled) && (
          <button
            type="button"
            onClick={handleResetHours}
            aria-label={hoursResetLabel}
            title={hoursResetLabel}
            className={`${iconBtn} touch-manipulation`}
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden />
          </button>
        )}

        {isFullscreen && (
          <button
            type="button"
            onClick={toggleHs}
            disabled={hsUnavailable}
            title={hsUnavailable ? `${hsHint} — indisponível` : hsHint}
            className={`${item} ${hsUnavailable ? itemDisabled : hsEnabled ? active.waves : ''}`}
            aria-label={hsLabel}
            aria-pressed={hsEnabled}
            data-map-hs-toggle
          >
            <Activity className="w-4 h-4 shrink-0" aria-hidden />
            <span className={itemLabel}>{hsLabel}</span>
          </button>
        )}

        {isFullscreen && (
          <button
            type="button"
            onClick={toggleSst}
            disabled={sstUnavailable}
            title={sstUnavailable ? `${sstHint} — indisponível` : sstHint}
            className={`${item} ${sstUnavailable ? itemDisabled : sstEnabled ? active.period : ''}`}
            aria-label={sstLabel}
            aria-pressed={sstEnabled}
            data-map-sst-toggle
          >
            <Thermometer className="w-4 h-4 shrink-0" aria-hidden />
            <span className={itemLabel}>{sstLabel}</span>
          </button>
        )}

        {isFullscreen && (
          <button
            type="button"
            onClick={toggleCurrents}
            disabled={currentsUnavailable}
            title={currentsUnavailable ? `${currentsHint} — indisponível` : currentsHint}
            className={`${item} ${currentsUnavailable ? itemDisabled : currentsEnabled ? active.water : ''}`}
            aria-label={currentsLabel}
            aria-pressed={currentsEnabled}
            data-map-currents-toggle
          >
            <Navigation className="w-4 h-4 shrink-0" aria-hidden />
            <span className={itemLabel}>{currentsLabel}</span>
          </button>
        )}

        {isFullscreen && (
          <button
            type="button"
            onClick={toggleBuoys}
            title={buoysHint}
            className={`${item} ${buoysEnabled ? active.waves : ''}`}
            aria-label={buoysLabel}
            aria-pressed={buoysEnabled}
            data-map-buoys-toggle
          >
            <LifeBuoy className="w-4 h-4 shrink-0" aria-hidden />
            <span className={itemLabel}>{buoysLabel}</span>
          </button>
        )}

        <button
          type="button"
          onClick={toggleIsobaths}
          title={isobathsLabel}
          className={`${item} ${isobathsEnabled ? active.waves : ''}`}
          aria-label={isobathsLabel}
          aria-pressed={isobathsEnabled}
          data-map-isobaths-toggle
        >
          <Waves className="w-4 h-4 shrink-0" aria-hidden />
          <span className={itemLabel}>{isobathsLabel}</span>
        </button>

        <button
          type="button"
          onClick={toggleCoastalWarnings}
          title={coastalWarningsLabel}
          className={`${item} ${coastalWarningsEnabled ? active.radar : ''}`}
          aria-label={coastalWarningsLabel}
          aria-pressed={coastalWarningsEnabled}
        >
          <Anchor className="w-4 h-4 shrink-0" aria-hidden />
          <span className={itemLabel}>{coastalWarningsLabel}</span>
        </button>

        {divider}

        <button
          type="button"
          onClick={toggleOnlyOn}
          title={onlyOnHint}
          className={`${item} ${onlyOnEnabled ? active.good : 'text-fg'}`}
          aria-label={onlyOnLabel}
          aria-pressed={onlyOnEnabled}
        >
          <Zap className="w-4 h-4 shrink-0" aria-hidden />
          <span className="hidden lg:inline">{onlyOnLabel}</span>
        </button>
      </div>
    </div>
  );
}
