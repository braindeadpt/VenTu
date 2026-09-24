'use client';

import { getTranslation } from '@/lib/i18n';
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import FilterPill from '@/components/ui/FilterPill';
import MapSpotList, { type MapSpotListRow } from './MapSpotList';
import type { MapFullscreenHudProps } from '../../mapHudTypes';
import type { BasemapMode } from '../../MapLayerToggle';

/**
 * Painel lateral do /mapa em desktop — a lista sincronizada com a vista.
 * Docado à esquerda (a coluna de controlos fica à direita); colapsa para um
 * rail de 48px com a contagem. O «Só a bombar» vive aqui — não duplicado na
 * barra de cima.
 */
interface MapSpotPanelProps extends MapFullscreenHudProps {
  rows: MapSpotListRow[];
  focusSpotId?: string;
  onSelectRow: (row: MapSpotListRow) => void;
  /** Controlado pelo pai — o carrossel do radar precisa do offset. */
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
  onlyOnEnabled: boolean;
  onToggleOnlyOn: () => void;
  onlyOnLabel: string;
  onlyOnHint: string;
  warningChip?: React.ReactNode;
  /** Trilho das 48h / radar — vive no painel em desktop (era do HUD). */
  timeTrack?: React.ReactNode;
  /** Radiogroup «Mapa base» — CORRECCOES-24SET (M5): saiu do painel para a
   *  secção «Base» do menu Camadas. As props ficam na interface para não
   *  partir os callers (a M6 pode limpá-las). */
  basemapMode: BasemapMode;
  onBasemapChange: (mode: BasemapMode) => void;
  attributionHtml: string;
}

export default function MapSpotPanel({
  rows,
  collapsed,
  onCollapsedChange,
  focusSpotId,
  onSelectRow,
  onlyOnEnabled,
  onToggleOnlyOn,
  onlyOnLabel,
  onlyOnHint,
  warningChip,
  timeTrack,
  attributionHtml,
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
  locale,
  isPt,
}: MapSpotPanelProps) {
  const t = getTranslation(locale);
  if (collapsed) {
    return (
      <div
        data-map-panel="rail"
        className="absolute left-2 top-2 z-[1100] flex w-12 flex-col items-center gap-2 rounded-card border border-divider-strong bg-bg-elevated/95 py-1.5 shadow-card backdrop-blur-md"
      >
        <button
          type="button"
          onClick={() => onCollapsedChange(false)}
          aria-label={t.spotsMap.openSpotsList}
          className="flex h-9 w-9 items-center justify-center rounded-input text-fg-muted hover:bg-surface-2/[0.08] hover:text-fg"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
        <span
          className="font-mono tabular-nums text-[11px] text-fg-subtle"
          style={{ writingMode: 'vertical-rl' }}
        >
          {spotCount} spots
        </span>
      </div>
    );
  }

  return (
    <div
      role="complementary"
      aria-label={t.spotsMap.spotsInView}
      data-map-panel="open"
      className="absolute bottom-2 left-2 top-2 z-[1100] flex w-[348px] max-w-[calc(100vw-1rem)] flex-col rounded-card border border-divider-strong bg-bg-elevated/95 shadow-card backdrop-blur-md"
    >
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <span className="font-display text-body-sm font-bold text-fg">
          {t.spotsMap.inView}
        </span>
        <button
          type="button"
          onClick={() => onCollapsedChange(true)}
          aria-label={t.spotsMap.collapsePanel}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-input text-fg-muted hover:bg-surface-2/[0.08] hover:text-fg"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-1.5 px-3 pt-2">
        <div className="edge-fade-x-end flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="group" aria-label={t.spotsMap.sportWord}>
          {sports.map((s) => (
            <FilterPill key={s.id} compact active={selectedSport === s.id} onClick={() => onSportChange(s.id)} icon={s.icon}>
              {s.label}
            </FilterPill>
          ))}
        </div>
        <div className="edge-fade-x-end flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="group" aria-label={t.spotsMap.region}>
          {regions.map((r) => (
            <FilterPill key={r} compact active={selectedRegion === r} onClick={() => onRegionChange(r)}>
              {r}
            </FilterPill>
          ))}
        </div>
        <div className="edge-fade-x-end flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="group" aria-label={difficultyGroupLabel}>
          {difficulties.map((d) => (
            <FilterPill key={d.id} compact active={selectedDifficulty === d.id} onClick={() => onDifficultyChange(d.id)}>
              {d.label}
            </FilterPill>
          ))}
          <FilterPill
            compact
            active={onlyOnEnabled}
            onClick={onToggleOnlyOn}
            aria-label={onlyOnHint ? `${onlyOnLabel} — ${onlyOnHint}` : onlyOnLabel}
            icon={<Zap className="h-3.5 w-3.5" aria-hidden />}
            toggleAttr="data-map-only-on-toggle"
          >
            {onlyOnLabel}
          </FilterPill>
        </div>
        {showClearFilters && (
          <FilterPill compact onClick={onResetFilters} className="self-start">
            {clearFiltersLabel}
          </FilterPill>
        )}
        {warningChip}
        {timeTrack}
        {/* Basemap saiu para o menu Camadas (CORRECCOES-24SET, «Para a M5»). */}
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col border-t border-divider px-3 pt-2">
        <MapSpotList
          rows={rows}
          title="Spots"
          countLabel={`${rows.length}/${spotCount}`}
          sortLabel={t.spotsMap.byScore}
          emptyLabel={t.spotsMap.noSpotsInView}
          focusSpotId={focusSpotId}
          onSelect={onSelectRow}
          listLabel={t.spotsMap.spotsVisibleOnMap}
        />
      </div>

      {attributionHtml && (
        <div
          data-panel-attribution
          className="truncate border-t border-divider px-3 py-1.5 text-[10px] leading-tight text-fg-subtle [&_a]:text-fg-muted [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: attributionHtml }}
        />
      )}
    </div>
  );
}
