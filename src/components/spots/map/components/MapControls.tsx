'use client';

import { Maximize2, Minimize2, MapPin, Layers, Wind, HelpCircle, CloudRain, RotateCcw, Waves, Zap, Anchor, Clock, LifeBuoy, Activity, Navigation, Thermometer, Mountain, Sailboat } from 'lucide-react';
import MapLayersMenu, { type MapLayersMenuItem } from './MapLayersMenu';

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
  bathymetryEnabled: boolean;
  seamarksEnabled: boolean;
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
  bathymetryLabel: string;
  bathymetryHint: string;
  seamarksLabel: string;
  seamarksHint: string;
  onlyOnLabel: string;
  onlyOnHint: string;
  windLegendHelpLabel: string;
  coastalWarningsLabel: string;
  layersLabel: string;
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
  toggleBathymetry: () => void;
  toggleSeamarks: () => void;
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
  bathymetryEnabled,
  seamarksEnabled,
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
  bathymetryLabel,
  bathymetryHint,
  seamarksLabel,
  seamarksHint,
  onlyOnLabel,
  onlyOnHint,
  windLegendHelpLabel,
  coastalWarningsLabel,
  layersLabel,
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
  toggleBathymetry,
  toggleSeamarks,
  toggleOnlyOn,
  toggleCoastalWarnings,
  windButtonRef,
  fullscreenBtnRef,
}: MapControlsProps) {
  if (isHeroEmbed) return null;
  // Mobile fullscreen uses the bottom HUD; desktop keeps these labelled menus.
  if (isFullscreen && isMobile) return null;

  // Camadas de dados → menu «Camadas» (C4). As gated por isFullscreen só
  // existem no /mapa — na versão embed o menu fica só com as camadas fixas.
  const layerMenuItems: MapLayersMenuItem[] = [
    ...(isFullscreen
      ? ([
          {
            key: 'hours',
            label: hoursLabel,
            hint: hoursUnavailable ? `${hoursHint} — indisponível` : hoursHint,
            icon: <Clock className="w-4 h-4" aria-hidden />,
            pressed: hoursEnabled,
            disabled: hoursUnavailable,
            onToggle: toggleHours,
            toggleAttr: 'data-map-hours-toggle',
            iconClass: 'text-score-good',
            resetVisible: hoursPrefSet || hoursEnabled,
            onReset: handleResetHours,
            resetLabel: hoursResetLabel,
          },
          {
            key: 'hs',
            label: hsLabel,
            hint: hsUnavailable ? `${hsHint} — indisponível` : hsHint,
            icon: <Activity className="w-4 h-4" aria-hidden />,
            pressed: hsEnabled,
            disabled: hsUnavailable,
            onToggle: toggleHs,
            toggleAttr: 'data-map-hs-toggle',
            iconClass: 'text-data-waves',
          },
          {
            key: 'sst',
            label: sstLabel,
            hint: sstUnavailable ? `${sstHint} — indisponível` : sstHint,
            icon: <Thermometer className="w-4 h-4" aria-hidden />,
            pressed: sstEnabled,
            disabled: sstUnavailable,
            onToggle: toggleSst,
            toggleAttr: 'data-map-sst-toggle',
            iconClass: 'text-data-period',
          },
          {
            key: 'currents',
            label: currentsLabel,
            hint: currentsUnavailable ? `${currentsHint} — indisponível` : currentsHint,
            icon: <Navigation className="w-4 h-4" aria-hidden />,
            pressed: currentsEnabled,
            disabled: currentsUnavailable,
            onToggle: toggleCurrents,
            toggleAttr: 'data-map-currents-toggle',
            iconClass: 'text-data-water',
          },
          {
            key: 'buoys',
            label: buoysLabel,
            hint: buoysHint,
            icon: <LifeBuoy className="w-4 h-4" aria-hidden />,
            pressed: buoysEnabled,
            onToggle: toggleBuoys,
            toggleAttr: 'data-map-buoys-toggle',
            iconClass: 'text-data-waves',
          },
        ] satisfies MapLayersMenuItem[])
      : []),
    {
      key: 'isobaths',
      label: isobathsLabel,
      hint: isobathsLabel,
      icon: <Waves className="w-4 h-4" aria-hidden />,
      pressed: isobathsEnabled,
      onToggle: toggleIsobaths,
      toggleAttr: 'data-map-isobaths-toggle',
      iconClass: 'text-data-waves',
    },
    {
      key: 'bathymetry',
      label: bathymetryLabel,
      hint: bathymetryHint,
      icon: <Mountain className="w-4 h-4" aria-hidden />,
      pressed: bathymetryEnabled,
      onToggle: toggleBathymetry,
      toggleAttr: 'data-map-bathymetry-toggle',
      iconClass: 'text-data-water',
    },
    {
      key: 'seamarks',
      label: seamarksLabel,
      hint: seamarksHint,
      icon: <Sailboat className="w-4 h-4" aria-hidden />,
      pressed: seamarksEnabled,
      onToggle: toggleSeamarks,
      toggleAttr: 'data-map-seamarks-toggle',
      iconClass: 'text-score-good',
    },
    {
      key: 'coastalWarnings',
      label: coastalWarningsLabel,
      hint: coastalWarningsLabel,
      icon: <Anchor className="w-4 h-4" aria-hidden />,
      pressed: coastalWarningsEnabled,
      onToggle: toggleCoastalWarnings,
      toggleAttr: 'data-map-coastal-warnings-toggle',
      iconClass: 'text-score-poor',
    },
  ];

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
          <span className="hidden lg:inline">{radarLabel}</span>
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

        {/* Auditoria 2026-09-16 (C4): o pill tinha ~14 ícones sem label —
            as camadas de dados vivem agora num menu com rótulos. Primários
            no chrome: fullscreen, cluster, vento, radar, «só a bombar». */}
        <MapLayersMenu
          label={layersLabel}
          variant="pill"
          direction="down"
          items={layerMenuItems}
        />

        {/* «Só a bombar» — no /mapa fullscreen vive no painel lateral (uma
            única casa, decisão do mockup aprovado); no embed fica aqui. */}
        {!isFullscreen && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
