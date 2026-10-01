'use client';

import { Crosshair, List, Loader2, Minimize2, Minus, Plus, Share2, Wind } from 'lucide-react';
import MapLayersMenu from './MapLayersMenu';
import MapControlButton from '@/components/ui/MapControlButton';
import { buildLayerMenuItems, type MapControlsProps } from './MapControls';

/**
 * Pilha vertical de controlos do /mapa (UX v3 §2, maquete .stack):
 *   [+] [−] (só pointer:fine) · Localizar · Camadas · Vento · Legenda ·
 *   Partilhar — botões 44 px, raio 12 px, gap 8 px, estado «on» sólido
 *   neutro e tooltip à esquerda só em hover real.
 *
 * O selector `data-map-controls` mantém-se — os specs e o contrato de
 * empilhamento tratam «a barra de controlos» como esta superfície.
 * O trigger do menu «Camadas» é o MapLayersMenu (M5) portalizado.
 */

interface StackButtonProps {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  busy?: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
  attr?: string;
}

function StackButton({ label, onClick, children, pressed, disabled, busy, buttonRef, attr }: StackButtonProps) {
  return (
    <div className="map-cb relative">
      <MapControlButton
        ref={buttonRef}
        onClick={onClick}
        pressed={pressed}
        disabled={disabled}
        aria-label={label}
        aria-busy={busy || undefined}
        {...(attr ? { [attr]: true } : {})}
        className="h-11 w-11 border-divider bg-bg-elevated text-fg-muted shadow-card hover:bg-bg-elevated hover:text-fg"
      >
        {children}
      </MapControlButton>
      <span
        aria-hidden
        className="map-cb-lbl absolute right-[calc(100%+8px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-input bg-fg px-2 py-0.5 text-meta-sm font-medium text-bg-base shadow-card"
      >
        {label}
      </span>
    </div>
  );
}

export default function MapControlStack({
  controls,
  locateLabel,
  shareLabel,
  locating,
  onLocate,
  onShare,
  onZoomIn,
  onZoomOut,
  legendOpen,
  onToggleLegend,
  legendLabel,
  controlsLabel,
  zoomInLabel,
  zoomOutLabel,
  windToggleLabel,
  exitLabel,
  onExit,
}: {
  controls: MapControlsProps;
  locateLabel: string;
  shareLabel: string;
  locating: boolean;
  onLocate: () => void;
  onShare: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  legendOpen: boolean;
  onToggleLegend: () => void;
  legendLabel: string;
  controlsLabel: string;
  zoomInLabel: string;
  zoomOutLabel: string;
  /** «Vento» — o estado vai em aria-pressed, não no label (spec §2). */
  windToggleLabel: string;
  /** Sair do fullscreen — só nos overlays (grid /spots); na rota /mapa a
      saída é o logo/Esc (a maquete não tem botão de saída). */
  exitLabel?: string;
  onExit?: () => void;
}) {
  const layerMenuItems = buildLayerMenuItems(controls);

  return (
    <div
      className="absolute right-3 top-3 z-[1150] flex flex-col items-end gap-2"
      role="toolbar"
      aria-label={controlsLabel}
      aria-orientation="vertical"
      data-map-controls="true"
      data-map-control-stack
    >
      {/* Zoom — só pointer:fine (CSS .map-zoom-group); o pinch cobre toque. */}
      <div className="map-zoom-group relative border border-divider bg-bg-elevated shadow-card">
        {[
          { label: zoomInLabel, onClick: onZoomIn, icon: <Plus className="w-[19px] h-[19px]" aria-hidden />, attr: 'data-map-zoom-in' },
          { label: zoomOutLabel, onClick: onZoomOut, icon: <Minus className="w-[19px] h-[19px]" aria-hidden />, attr: 'data-map-zoom-out' },
        ].map((b) => (
          <div key={b.attr} className="map-cb relative">
            <MapControlButton
              onClick={b.onClick}
              aria-label={b.label}
              {...{ [b.attr]: true }}
              className="h-11 w-11 text-fg-muted hover:text-fg"
            >
              {b.icon}
            </MapControlButton>
            <span
              aria-hidden
              className="map-cb-lbl absolute right-[calc(100%+8px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-input bg-fg px-2 py-0.5 text-meta-sm font-medium text-bg-base shadow-card"
            >
              {b.label}
            </span>
          </div>
        ))}
      </div>

      <StackButton label={locateLabel} onClick={onLocate} busy={locating} attr="data-map-locate">
        {locating ? (
          <Loader2 className="w-[19px] h-[19px] animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Crosshair className="w-[19px] h-[19px]" aria-hidden />
        )}
      </StackButton>

      {/* «Camadas» — o trigger é o MapControlButton do MapLayersMenu (raio
          e «on» corrigidos pelo CSS da pilha); o popover é portalizado. */}
      <div className="map-cb relative">
        <MapLayersMenu
          label={controls.layersLabel}
          variant="hud"
          direction="left"
          items={layerMenuItems}
        />
        <span
          aria-hidden
          className="map-cb-lbl absolute right-[calc(100%+8px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-input bg-fg px-2 py-0.5 text-meta-sm font-medium text-bg-base shadow-card"
        >
          {controls.layersLabel}
        </span>
      </div>

      <StackButton
        label={windToggleLabel}
        onClick={controls.toggleWind}
        pressed={controls.windEnabled}
        buttonRef={controls.windButtonRef}
        attr="data-map-wind-toggle"
      >
        <Wind className="w-[19px] h-[19px]" aria-hidden />
      </StackButton>

      <StackButton
        label={legendLabel}
        onClick={onToggleLegend}
        pressed={legendOpen}
        attr="data-map-legend-toggle"
      >
        <List className="w-[19px] h-[19px]" aria-hidden />
      </StackButton>

      <StackButton label={shareLabel} onClick={onShare} attr="data-map-share">
        <Share2 className="w-[19px] h-[19px]" aria-hidden />
      </StackButton>

      {exitLabel && onExit && (
        <StackButton label={exitLabel} onClick={onExit} attr="data-map-exit-fullscreen">
          <Minimize2 className="w-[19px] h-[19px]" aria-hidden />
        </StackButton>
      )}
    </div>
  );
}
