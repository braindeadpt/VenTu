'use client';

import { Maximize2, Minimize2, MapPin, Layers, Wind, HelpCircle, CloudRain, RotateCcw, Waves, Zap, Anchor, Clock, LifeBuoy, Activity, Navigation, Thermometer, Mountain, Sailboat } from 'lucide-react';
import MapLayersMenu, { type MapLayersMenuItem } from './MapLayersMenu';

export interface MapControlsProps {
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
 * Itens do menu «Camadas» — partilhado entre o pill dos embeds
 * (MapControls) e a pilha direita do /mapa (MapControlStack, UX v3 §2/§8).
 * As camadas gated por isFullscreen só existem no /mapa; no /mapa o radar
 * entra no menu (grupo «Tempo» da maquete: «Próximas 48 h» + «Radar IPMA»).
 */
export function buildLayerMenuItems(p: MapControlsProps): MapLayersMenuItem[] {
  return [
    ...(p.isFullscreen
      ? ([
          {
            key: 'hours',
            label: p.hoursLabel,
            hint: p.hoursUnavailable ? `${p.hoursHint} — indisponível` : p.hoursHint,
            icon: <Clock className="w-4 h-4" aria-hidden />,
            pressed: p.hoursEnabled,
            disabled: p.hoursUnavailable,
            onToggle: p.toggleHours,
            toggleAttr: 'data-map-hours-toggle',
            iconClass: 'text-score-good',
            resetVisible: p.hoursPrefSet || p.hoursEnabled,
            onReset: p.handleResetHours,
            resetLabel: p.hoursResetLabel,
          },
          {
            key: 'radar',
            label: p.radarLabel,
            hint: p.radarUnavailable ? `${p.radarHint} — indisponível` : p.radarHint,
            icon: <CloudRain className="w-4 h-4" aria-hidden />,
            pressed: p.radarEnabled,
            disabled: p.radarUnavailable,
            onToggle: p.toggleRadar,
            toggleAttr: 'data-map-radar-toggle',
            iconClass: 'text-data-waves',
            resetVisible: p.radarPrefSet || p.radarEnabled,
            onReset: p.handleResetRadar,
            resetLabel: p.radarResetLabel,
          },
          {
            key: 'hs',
            label: p.hsLabel,
            hint: p.hsUnavailable ? `${p.hsHint} — indisponível` : p.hsHint,
            icon: <Activity className="w-4 h-4" aria-hidden />,
            pressed: p.hsEnabled,
            disabled: p.hsUnavailable,
            onToggle: p.toggleHs,
            toggleAttr: 'data-map-hs-toggle',
            iconClass: 'text-data-waves',
          },
          {
            key: 'sst',
            label: p.sstLabel,
            hint: p.sstUnavailable ? `${p.sstHint} — indisponível` : p.sstHint,
            icon: <Thermometer className="w-4 h-4" aria-hidden />,
            pressed: p.sstEnabled,
            disabled: p.sstUnavailable,
            onToggle: p.toggleSst,
            toggleAttr: 'data-map-sst-toggle',
            iconClass: 'text-data-period',
          },
          {
            key: 'currents',
            label: p.currentsLabel,
            hint: p.currentsUnavailable ? `${p.currentsHint} — indisponível` : p.currentsHint,
            icon: <Navigation className="w-4 h-4" aria-hidden />,
            pressed: p.currentsEnabled,
            disabled: p.currentsUnavailable,
            onToggle: p.toggleCurrents,
            toggleAttr: 'data-map-currents-toggle',
            iconClass: 'text-data-water',
          },
          {
            key: 'buoys',
            label: p.buoysLabel,
            hint: p.buoysHint,
            icon: <LifeBuoy className="w-4 h-4" aria-hidden />,
            pressed: p.buoysEnabled,
            onToggle: p.toggleBuoys,
            toggleAttr: 'data-map-buoys-toggle',
            iconClass: 'text-data-waves',
          },
        ] satisfies MapLayersMenuItem[])
      : []),
    {
      key: 'isobaths',
      label: p.isobathsLabel,
      hint: p.isobathsLabel,
      icon: <Waves className="w-4 h-4" aria-hidden />,
      pressed: p.isobathsEnabled,
      onToggle: p.toggleIsobaths,
      toggleAttr: 'data-map-isobaths-toggle',
      iconClass: 'text-data-waves',
    },
    {
      key: 'bathymetry',
      label: p.bathymetryLabel,
      hint: p.bathymetryHint,
      icon: <Mountain className="w-4 h-4" aria-hidden />,
      pressed: p.bathymetryEnabled,
      onToggle: p.toggleBathymetry,
      toggleAttr: 'data-map-bathymetry-toggle',
      iconClass: 'text-data-water',
    },
    {
      key: 'seamarks',
      label: p.seamarksLabel,
      hint: p.seamarksHint,
      icon: <Sailboat className="w-4 h-4" aria-hidden />,
      pressed: p.seamarksEnabled,
      onToggle: p.toggleSeamarks,
      toggleAttr: 'data-map-seamarks-toggle',
      iconClass: 'text-score-good',
    },
    {
      key: 'coastalWarnings',
      label: p.coastalWarningsLabel,
      hint: p.coastalWarningsLabel,
      icon: <Anchor className="w-4 h-4" aria-hidden />,
      pressed: p.coastalWarningsEnabled,
      onToggle: p.toggleCoastalWarnings,
      toggleAttr: 'data-map-coastal-warnings-toggle',
      iconClass: 'text-score-poor',
    },
  ];
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

export default function MapControls(props: MapControlsProps) {
  const {
    isFullscreen,
    isHeroEmbed,
    clusterEnabled,
    windEnabled,
    radarEnabled,
    radarPrefSet,
    radarUnavailable,
    onlyOnEnabled,
    clusterLabel,
    windLabel,
    windHint,
    radarLabel,
    radarHint,
    radarResetLabel,
    onlyOnLabel,
    onlyOnHint,
    windLegendHelpLabel,
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
    toggleOnlyOn,
    windButtonRef,
    fullscreenBtnRef,
  } = props;

  // M2 UX v3 §2 — no /mapa fullscreen a barra do topo desaparece: os
  // controlos vivem na pilha direita (MapControlStack, montada pela
  // MapChromeZone). O pill mantém-se apenas nos embeds (!isFullscreen).
  if (isHeroEmbed || isFullscreen) return null;

  const layerMenuItems = buildLayerMenuItems(props);

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
