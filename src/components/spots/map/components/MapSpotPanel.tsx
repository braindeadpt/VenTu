'use client';

import { useEffect, useRef, useState } from 'react';
import { getTranslation } from '@/lib/i18n';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MapSpotList, { type MapListJump, type MapSpotListRow } from './MapSpotList';
import MapExploreFilters from './MapExploreFilters';
import type { MapFullscreenHudProps } from '../../mapHudTypes';
import type { BasemapMode } from '../../MapLayerToggle';

/**
 * Painel lateral do /mapa em desktop — a lista sincronizada com a vista
 * (MAP-UX-V3 §5, maquete aprovada): 360 px, colapsa num rail de 56 px com
 * a contagem vertical. Filtros com rótulo visível (segmented de modalidade
 * com quebra de linha, selects Região/Nível, switches «Só a bombar» e
 * «Agrupar spots», chips activos + «Limpar»), linha neutra de boias,
 * trilho temporal e lista «Nesta vista».
 *
 * O «Mapa/Satélite» vive na secção «Base» do menu «Camadas» (M5 merged na
 * M6) — o painel já não o renderiza; as props ficam na interface para não
 * partir os callers.
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
  onlyOnHint: string;
  /** Switch «Agrupar spots» — estado partilhado do orquestrador. */
  clusterEnabled: boolean;
  onToggleCluster: () => void;
  /** Nota de ordenação da lista («Ordenado por score · métricas de agora»). */
  noteLabel: string;
  /** Chips «Saltar para» no cabeçalho da lista. */
  jumpLabel: string;
  jumps: MapListJump[];
  onJump: (id: string) => void;
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
  onlyOnHint,
  clusterEnabled,
  onToggleCluster,
  noteLabel,
  jumpLabel,
  jumps,
  onJump,
  warningChip,
  timeTrack,
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
}: MapSpotPanelProps) {
  const t = getTranslation(locale);
  // A animação de entrada só corre a partir do primeiro TOGGLE — nunca no
  // primeiro render (o painel já nasce na posição; deslizar era ruído).
  const [didToggle, setDidToggle] = useState(false);
  const toggle = (v: boolean) => {
    setDidToggle(true);
    onCollapsedChange(v);
  };

  /* CORRECCOES-24SET (M6#5): o desvio do cromo ao painel aberto
     (atribuição Leaflet, wrap do scrubber, pill «Agora») não é um literal
     em globals.css — o painel publica `--map-panel-offset` (= borda
     direita medida + 12 px de respiro) no root [data-map-fullscreen]
     enquanto está aberto; ao recolher/desmontar a variável sai. */
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (collapsed) return;
    const el = panelRef.current;
    const root = el?.closest<HTMLElement>('[data-map-fullscreen]');
    if (!el || !root) return;
    const publish = () => {
      const right = el.getBoundingClientRect().right - root.getBoundingClientRect().left;
      root.style.setProperty('--map-panel-offset', `${Math.round(right + 12)}px`);
    };
    publish();
    window.addEventListener('resize', publish);
    return () => {
      window.removeEventListener('resize', publish);
      root.style.removeProperty('--map-panel-offset');
    };
  }, [collapsed]);
  if (collapsed) {
    return (
      <div
        data-map-panel="rail"
        className={`absolute left-2 top-2 z-[1100] flex w-14 flex-col items-center gap-2 rounded-card border border-divider-strong bg-bg-elevated/95 py-1.5 shadow-card backdrop-blur-md ${didToggle ? 'motion-safe:[animation:map-rail-in_240ms_cubic-bezier(.16,1,.3,1)_both]' : ''}`}
      >
        <button
          type="button"
          onClick={() => toggle(false)}
          aria-expanded={false}
          aria-label={t.spotsMap.openSpotsList}
          className="flex h-9 w-9 items-center justify-center rounded-input text-fg-muted hover:bg-surface-2/[0.08] hover:text-fg"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
        <span
          className="font-mono tabular-nums text-[11px] text-fg-subtle"
          style={{ writingMode: 'vertical-rl' }}
        >
          {t.mapUiExplore.railCount.replace('{count}', String(spotCount))}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      role="complementary"
      aria-label={t.mapUiExplore.title}
      data-map-panel="open"
      className={`absolute bottom-2 left-2 top-2 z-[1100] flex w-[360px] max-w-[calc(100vw-1rem)] flex-col rounded-card border border-divider-strong bg-bg-elevated/95 shadow-card backdrop-blur-md ${didToggle ? 'motion-safe:[animation:map-panel-in_240ms_cubic-bezier(.16,1,.3,1)_both]' : ''}`}
    >
      <div className="flex items-baseline gap-2 px-3 pb-1 pt-3">
        <span className="font-display text-body font-semibold text-fg">
          {t.mapUiExplore.title}
        </span>
        <span className="font-mono tabular-nums text-meta-sm text-fg-subtle">
          {t.mapUiExplore.spotsInViewCount.replace('{count}', String(rows.length))}
        </span>
        <button
          type="button"
          onClick={() => toggle(true)}
          aria-expanded={true}
          aria-label={t.spotsMap.collapsePanel}
          className="-my-1 ml-auto flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-input text-fg-muted hover:bg-surface-2/[0.08] hover:text-fg"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-3 px-3 pt-2">
        <MapExploreFilters
          idPrefix="p"
          sports={sports}
          selectedSport={selectedSport}
          onSportChange={onSportChange}
          regions={regions}
          selectedRegion={selectedRegion}
          onRegionChange={onRegionChange}
          difficulties={difficulties}
          selectedDifficulty={selectedDifficulty}
          onDifficultyChange={onDifficultyChange}
          difficultyGroupLabel={difficultyGroupLabel}
          onlyOnEnabled={onlyOnEnabled}
          onToggleOnlyOn={onToggleOnlyOn}
          onlyOnHint={onlyOnHint}
          clusterEnabled={clusterEnabled}
          onToggleCluster={onToggleCluster}
          onResetFilters={onResetFilters}
          clearFiltersLabel={clearFiltersLabel}
          showClearFilters={showClearFilters}
          locale={locale}
        />
        {warningChip}
        {timeTrack}
        {/* Basemap saiu para o menu Camadas (CORRECCOES-24SET, «Para a M5»). */}
      </div>

      <div className="mt-1 flex min-h-0 flex-1 flex-col px-3">
        <MapSpotList
          rows={rows}
          title={t.spotsMap.inView}
          countLabel={`${rows.length}/${spotCount}`}
          noteLabel={noteLabel}
          emptyLabel={t.mapUiExplore.emptyView}
          focusSpotId={focusSpotId}
          onSelect={onSelectRow}
          listLabel={t.spotsMap.spotsVisibleOnMap}
          jumpLabel={jumpLabel}
          jumps={jumps}
          onJump={onJump}
        />
      </div>
      {/* Atribuição: uma só vez no ecrã (CORRECCOES-24SET) — no desktop é o
          controlo Leaflet, desviado do painel por --map-panel-offset. O
          espelho textual que aqui existia foi removido na M6 (estava
          escondido por CSS desde a M2). A prop attributionHtml fica na
          interface para não partir os callers. */}
    </div>
  );
}
