'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Minimize2, Zap } from 'lucide-react';
import FilterPill from '@/components/ui/FilterPill';
import MapSpotList, { type MapSpotListRow } from './MapSpotList';
import MapBasemapRadio from './MapBasemapRadio';
import type { MapLayersMenuItem } from './MapLayersMenu';
import type { MapFullscreenHudProps } from '../../mapHudTypes';
import type { BasemapMode } from '../../MapLayerToggle';
import { getScoreTokens } from '@/lib/sportScore';
import { scoreFactorClass } from '@/lib/spotScoreFactors';
import { cn } from '@/lib/cn';

/**
 * Bottom sheet do /mapa em mobile — substitui o cartão «Modo Explorar».
 * Três estados com snap: peek (melhor spot + filtros essenciais), meio
 * (filtros e camadas COM rótulos) e aberto (lista sincronizada).
 *
 * Movimento (apple-design): o sheet tem altura fixa (estado aberto) e anda
 * por translateY — arrasto 1:1 no grabber, projeção de momentum no release,
 * snap ao estado mais próximo do ponto projetado. prefers-reduced-motion:
 * snap instantâneo e transição por cross-fade, sem slide.
 */

export type ExploreSheetState = 'peek' | 'half' | 'open';

export interface SheetToggleItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  onToggle: () => void;
  toggleAttr?: string;
  hint?: string;
}

interface MapExploreSheetProps extends MapFullscreenHudProps {
  state: ExploreSheetState;
  onStateChange: (s: ExploreSheetState) => void;
  /** Linhas da vista, ordenadas por score — a 1ª é o «Melhor agora» do peek. */
  rows: MapSpotListRow[];
  focusSpotId?: string;
  onSelectRow: (row: MapSpotListRow) => void;
  /** Camadas de dados com rótulo (radar, 48 h, hs, sst, correntes, boias,
   *  isóbatas, batimetria, sinalização, avisos) — MapLayersMenuItem da HUD. */
  layers: MapLayersMenuItem[];
  /** Primários do «Ver também»: agrupar, vento, legenda do vento —
   *  sempre com rótulo (o audit C4 proíbe strips só-ícone). O basemap
   *  (mapa/satélite) é o radiogroup `MapBasemapRadio` mesmo acima e a
   *  saída do fullscreen vive no grabber (sempre visível). */
  extras: SheetToggleItem[];
  /** Chip «Agrupar/Mostrar todos» no PEEK — o toggle vivia só no estado
   *  half (extras), inalcançável a quem fica sempre no peek do fullscreen
   *  mobile (D6). Mesmo item do half: label/estado/onToggle idênticos, uma
   *  superfície por estado — nunca dois botões com o mesmo nome no DOM. */
  clusterItem?: SheetToggleItem;
  /** Saída do fullscreen — sempre visível à esquerda do grabber (era do
   *  HUD antigo; o C4 exige uma saída que não dependa de abrir o sheet). */
  exitFullscreenLabel: string;
  onExitFullscreen: () => void;
  /** Radiogroup «Mapa base» (mapa/satélite) — era do HUD antigo. */
  basemapMode: BasemapMode;
  onBasemapChange: (mode: BasemapMode) => void;
  onlyOnEnabled: boolean;
  onToggleOnlyOn: () => void;
  onlyOnLabel: string;
  onlyOnHint: string;
  /** Chip de boias (BuoyLayerChip) — popover + dispensar já resolvidos. */
  warningChip?: React.ReactNode;
  /** Seção «Legenda» — MapLegend em modo estático dentro de <details>. */
  legendNode?: React.ReactNode;
  timeTrack?: React.ReactNode;
  /** innerHTML do controlo de atribuição Leaflet (useMapAttribution) — fica
   *  sempre visível no rodapé do conteúdo de cada estado. */
  attributionHtml: string;
  /** Altura do estado aberto — o pai calcula a partir do viewport. */
  openHeight: number;
}

const GRABBER_H = 32;
const ATTR_H = 20;
/** Snap targets como fração da altura do sheet aberto. */
const HALF_RATIO = 0.68;

function AttributionLine({ html }: { html: string }) {
  if (!html) return null;
  return (
    <div
      data-sheet-attribution
      className="shrink-0 truncate px-1 pt-1 text-[10px] leading-tight text-fg-subtle [&_a]:text-fg-muted [&_a]:underline"
      // O HTML vem do controlo de atribuição do Leaflet (links de créditos
      // das camadas ativas) — mesma fonte, sem duplicação de strings.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function LayerToggle({ item }: { item: MapLayersMenuItem }) {
  return (
    <button
      type="button"
      onClick={item.onToggle}
      disabled={item.disabled}
      aria-pressed={item.pressed}
      title={item.hint}
      {...(item.toggleAttr ? { [item.toggleAttr]: true } : {})}
      className={cn(
        'flex min-h-[44px] items-center gap-2 rounded-input border px-2.5 py-1.5 text-left text-meta-sm font-semibold transition-colors duration-150',
        item.disabled && 'opacity-40 cursor-not-allowed',
        item.pressed
          ? 'border-divider-strong bg-surface-2/[0.08] text-fg'
          : 'border-divider bg-surface-1/[0.04] text-fg-muted hover:text-fg',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
          item.pressed ? 'border-transparent bg-accent/90' : 'border-fg-subtle',
        )}
      >
        {item.pressed && (
          <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-none stroke-bg-base stroke-2"><path d="M1 4l2.5 2.5L9 1" /></svg>
        )}
      </span>
      <span className={cn('shrink-0', item.iconClass)}>{item.icon}</span>
      <span className="truncate">{item.label}</span>
    </button>
  );
}

export default function MapExploreSheet({
  state,
  onStateChange,
  rows,
  focusSpotId,
  onSelectRow,
  layers,
  extras,
  clusterItem,
  basemapMode,
  onBasemapChange,
  exitFullscreenLabel,
  onExitFullscreen,
  onlyOnEnabled,
  onToggleOnlyOn,
  onlyOnLabel,
  onlyOnHint,
  warningChip,
  legendNode,
  timeTrack,
  attributionHtml,
  openHeight,
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
  isPt,
}: MapExploreSheetProps) {
  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // ── Geometria: sheet de altura fixa (open), translateY revela porções ──
  const sheetRef = useRef<HTMLDivElement>(null);
  // O peek mede-se — o chip de boias e a linha de atribuição tornam a altura
  // variável; um ResizeObserver mantém o snap exacto.
  const [peekH, setPeekH] = useState(220);
  const peekContentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = peekContentRef.current;
    if (!el || state !== 'peek') return;
    const measure = () => setPeekH(GRABBER_H + Math.ceil(el.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [state]);
  const halfH = Math.round(openHeight * HALF_RATIO);
  const offsetFor = useCallback(
    (s: ExploreSheetState) =>
      s === 'open' ? 0 : s === 'half' ? openHeight - halfH : openHeight - peekH,
    [openHeight, halfH, peekH],
  );
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const offsetRef = useRef(offsetFor(state));
  // Snap targets ordenados do mais fechado ao mais aberto.
  const snapsRef = useRef<number[]>([offsetFor('peek'), offsetFor('half'), 0]);
  useEffect(() => {
    offsetRef.current = dragOffset ?? offsetFor(state);
    snapsRef.current = [offsetFor('peek'), offsetFor('half'), 0];
  }, [dragOffset, state, offsetFor]);

  const drag = useRef<{ y0: number; off0: number; hist: { t: number; y: number }[] } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = sheetRef.current;
    if (!el) return;
    // Interrupção a meio da animação: lê o transform REAL no ecrã e segue
    // daí — nunca do valor lógico (apple-design §3).
    setAnimating(false);
    const live = el.getBoundingClientRect();
    const base = el.offsetParent
      ? el.offsetParent.getBoundingClientRect().bottom - el.offsetHeight
      : live.top;
    const start = Math.min(Math.max(live.top - base, 0), snapsRef.current[0]);
    drag.current = { y0: e.clientY, off0: start, hist: [{ t: performance.now(), y: e.clientY }] };
    // Capture NO BOTÃO — no contentor re-alvoava o click para o sheet e o
    // toque no grabber deixava de ciclar estados.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragOffset(start);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    d.hist.push({ t: performance.now(), y: e.clientY });
    if (d.hist.length > 8) d.hist.shift();
    const max = snapsRef.current[0];
    let next = d.off0 + (e.clientY - d.y0);
    // Rubber-band nos limites (resistência progressiva, não hard-stop).
    if (next < 0) next = -((-next * 0.35));
    if (next > max) next = max + (next - max) * 0.35;
    setDragOffset(next);
  };

  // O click sintético após pointer capture + touch-action:none é re-alvo
  // ou suprimido em alguns browsers — o toque é detetado no pointerup
  // (distância < 8px) e o onClick serve só o teclado (guard lastTap).
  const lastTapRef = useRef(0);
  const cycleState = () => {
    onStateChange(state === 'peek' ? 'half' : state === 'half' ? 'open' : 'peek');
  };

  const settle = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (Math.abs(e.clientY - d.y0) < 8) {
      // Toque sem arrasto → percorre os estados (peek→half→open→peek).
      lastTapRef.current = performance.now();
      setDragOffset(null);
      cycleState();
      return;
    }
    const now = performance.now();
    const recent = d.hist.filter((h) => now - h.t < 120);
    const v = recent.length > 1
      ? (recent[recent.length - 1].y - recent[0].y) / ((recent[recent.length - 1].t - recent[0].t) || 1) * 1000
      : 0;
    const cur = dragOffset ?? d.off0;
    // Projeção de momentum (decelerationRate ≈ 0.998) → snap mais próximo
    // de onde o gesto ia parar, não de onde o dedo largou.
    const projected = cur + (v / 1000) * 0.998 / (1 - 0.998);
    const targets = snapsRef.current;
    let best = targets[0];
    for (const s of targets) if (Math.abs(s - projected) < Math.abs(best - projected)) best = s;
    setDragOffset(null);
    setAnimating(true);
    onStateChange(best === 0 ? 'open' : best === offsetFor('half') ? 'half' : 'peek');
  };

  const onGrabberClick = () => {
    if (performance.now() - lastTapRef.current < 400) return;
    cycleState();
  };

  // prefers-reduced-motion: a posição muda instantaneamente e o conteúdo
  // faz cross-fade — renderizamos o estado anterior por cima, a esbater-se.
  const [crossFrom, setCrossFrom] = useState<ExploreSheetState | null>(null);
  const prevStateRef = useRef(state);
  useEffect(() => {
    if (!reduced || prevStateRef.current === state) {
      prevStateRef.current = state;
      return;
    }
    setCrossFrom(prevStateRef.current);
    prevStateRef.current = state;
    const t = setTimeout(() => setCrossFrom(null), 240);
    return () => clearTimeout(t);
  }, [state, reduced]);

  const translateY = dragOffset ?? offsetFor(state);
  const best = rows[0] ?? null;
  const bestTok = best ? getScoreTokens(best.score) : null;
  const sportLabel = sports.find((s) => s.id === selectedSport)?.label ?? sports[0]?.label;

  const toggleChip = (item: SheetToggleItem) => (
    <button
      key={item.key}
      type="button"
      onClick={item.onToggle}
      disabled={item.disabled}
      aria-pressed={item.pressed}
      title={item.hint}
      {...(item.toggleAttr ? { [item.toggleAttr]: true } : {})}
      className={cn(
        'flex min-h-[44px] items-center gap-2 rounded-input border px-2.5 py-1.5 text-left text-meta-sm font-semibold transition-colors duration-150',
        item.disabled && 'opacity-40 cursor-not-allowed',
        item.pressed
          ? 'border-divider-strong bg-surface-2/[0.08] text-fg'
          : 'border-divider bg-surface-1/[0.04] text-fg-muted hover:text-fg',
      )}
    >
      {item.icon}
      <span className="truncate">{item.label}</span>
    </button>
  );

  // `ghost`: a cópia do estado anterior que se esbate no cross-fade de
  // reduced-motion. É só imagem — sem chip de boias (duplicava o botão e o
  // seletor [data-buoy-layer-chip] resolvia para 2 elementos) e inert.
  const renderState = (s: ExploreSheetState, ghost = false) =>
    s === 'peek' ? (
      // SEM flex-1: o peek mede-se pela altura NATURAL do conteúdo. Com
      // flex-1 o div esticava até à altura do estado aberto, o
      // ResizeObserver media essa altura, e o «peek» ficava do tamanho do
      // sheet inteiro — no iPhone 13 sobravam ~50 px de mapa visível.
      <div
        ref={s === state && !ghost ? peekContentRef : undefined}
        className="flex shrink-0 flex-col gap-2 px-3 pb-2"
        data-sheet-peek
      >
        {!ghost && warningChip}
        {best && bestTok && (
          <button
            type="button"
            onClick={() => onSelectRow(best)}
            className="flex min-h-[52px] items-center gap-2.5 rounded-input border border-divider bg-surface-1/[0.05] px-2.5 py-1.5 text-left"
            data-sheet-best
          >
            <span className={`inline-flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg font-mono text-sm font-bold leading-none ${bestTok.bg} ${bestTok.text}`}>
              {best.score}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
                {isPt ? 'Melhor agora' : 'Best now'}
              </span>
              <span className="block truncate text-body-sm">
                <span className="font-display font-bold text-fg">{best.name}</span>
                <span className="text-fg-muted"> · {best.region}</span>
              </span>
            </span>
            <span
              className="shrink-0 text-right font-mono tabular-nums text-meta-sm text-fg-muted"
              data-score-factors={best.factors.map((f) => f.label).join(' · ')}
            >
              {best.factors.map((f, fi) => (
                <span key={fi}>
                  {fi > 0 && <span aria-hidden className="text-fg-subtle/40"> · </span>}
                  <span className={scoreFactorClass(f.kind)}>{f.short}</span>
                </span>
              ))}
            </span>
          </button>
        )}
        <div
          className="edge-fade-x-end flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x"
          role="group"
          aria-label={isPt ? 'Filtros essenciais' : 'Essential filters'}
        >
          <FilterPill compact onClick={() => onStateChange('half')}>
            {sportLabel} <ChevronDown className="h-3 w-3" aria-hidden />
          </FilterPill>
          <FilterPill compact onClick={() => onStateChange('half')}>
            {isPt ? 'Região' : 'Region'}: {selectedRegion} <ChevronDown className="h-3 w-3" aria-hidden />
          </FilterPill>
          <FilterPill compact active={onlyOnEnabled} onClick={onToggleOnlyOn} aria-label={onlyOnLabel} icon={<Zap className="h-3.5 w-3.5" aria-hidden />} toggleAttr="data-map-only-on-toggle">
            {onlyOnLabel}
          </FilterPill>
          {clusterItem && (
            <FilterPill
              compact
              active={clusterItem.pressed}
              onClick={clusterItem.onToggle}
              aria-label={clusterItem.label}
              icon={clusterItem.icon}
            >
              {clusterItem.label}
            </FilterPill>
          )}
          <span className="ml-auto shrink-0 font-mono tabular-nums text-meta-sm text-fg-subtle">
            {spotCount} {isPt ? 'spots' : 'spots'}
          </span>
        </div>
        <AttributionLine html={attributionHtml} />
      </div>
    ) : s === 'half' ? (
      // O sheet tem a altura do estado aberto e anda por translateY — sem
      // cap, o scrollport estendia-se abaixo do viewport e o fim do conteúdo
      // ficava inalcançável. A altura útil é a porção visível do «half».
      <div
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 pb-2"
        style={{ maxHeight: Math.max(160, halfH - GRABBER_H) }}
        data-sheet-half
      >
        {!ghost && warningChip}
        {timeTrack}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-fg-subtle">
            {isPt ? 'Modalidade' : 'Sport'}
          </span>
          <div className="edge-fade-x-end flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x pb-0.5" role="group" aria-label={isPt ? 'Modalidade' : 'Sport'}>
            {sports.map((sp) => (
              <FilterPill key={sp.id} compact active={selectedSport === sp.id} onClick={() => onSportChange(sp.id)} icon={sp.icon}>
                {sp.label}
              </FilterPill>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-fg-subtle">{difficultyGroupLabel}</span>
          <div className="edge-fade-x-end flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x pb-0.5" role="group" aria-label={difficultyGroupLabel}>
            {difficulties.map((d) => (
              <FilterPill key={d.id} compact active={selectedDifficulty === d.id} onClick={() => onDifficultyChange(d.id)}>
                {d.label}
              </FilterPill>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-fg-subtle">
            {isPt ? 'Região' : 'Region'}
          </span>
          <div className="edge-fade-x-end flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x pb-0.5" role="group" aria-label={isPt ? 'Região' : 'Region'}>
            {regions.map((r) => (
              <FilterPill key={r} compact active={selectedRegion === r} onClick={() => onRegionChange(r)}>
                {r}
              </FilterPill>
            ))}
          </div>
        </div>
        {showClearFilters && (
          <FilterPill compact onClick={onResetFilters} className="self-start">
            {clearFiltersLabel}
          </FilterPill>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-fg-subtle">
            {isPt ? 'Camadas' : 'Layers'}
          </span>
          <div
            className="grid grid-cols-2 gap-1.5"
            role="group"
            aria-label={isPt ? 'Camadas' : 'Layers'}
          >
            {layers.map((item) => <LayerToggle key={item.key} item={item} />)}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-fg-subtle">
            {isPt ? 'Ver também' : 'See also'}
          </span>
          <MapBasemapRadio value={basemapMode} onChange={onBasemapChange} isPt={isPt} />
          <div
            className="grid grid-cols-2 gap-1.5"
            role="group"
            aria-label={isPt ? 'Ver também' : 'See also'}
          >
            {extras.map(toggleChip)}
          </div>
        </div>
        {legendNode && (
          <details className="rounded-input border border-divider bg-surface-1/[0.03] px-2.5 py-1.5">
            <summary className="flex min-h-[44px] cursor-pointer items-center text-meta-sm font-semibold text-fg-muted">
              {isPt ? 'Legenda' : 'Legend'}
            </summary>
            {legendNode}
          </details>
        )}
        <AttributionLine html={attributionHtml} />
      </div>
    ) : (
      <div className="flex min-h-0 flex-1 flex-col px-3 pb-2" data-sheet-open>
        <MapSpotList
          rows={rows}
          title={isPt ? 'Nesta vista' : 'In view'}
          countLabel={`${rows.length} ${isPt ? 'spots' : 'spots'}`}
          sortLabel={isPt ? 'por score' : 'by score'}
          emptyLabel={isPt ? 'Sem spots nesta vista' : 'No spots in view'}
          hintLabel={isPt
            ? 'A lista segue o pan/zoom do mapa. Tocar num spot aproxima e abre o detalhe — com teclado: ↑ ↓ navegam, Enter abre.'
            : 'The list follows map pan/zoom. Tap a spot to fly to it and open details — keyboard: ↑ ↓ move, Enter opens.'}
          focusSpotId={focusSpotId}
          onSelect={onSelectRow}
          listLabel={isPt ? 'Spots visíveis no mapa' : 'Spots visible on map'}
        />
        <AttributionLine html={attributionHtml} />
      </div>
    );

  return (
    <div
      ref={sheetRef}
      role="region"
      aria-label={isPt ? 'Modo explorar' : 'Explore mode'}
      data-explore-sheet={state}
      // Mesmo contrato do HUD antigo: o useMapLayers mede a porção visível
      // (vh − rect.top) para levantar o carrossel do radar e a legenda.
      data-map-hud-collapsed={state === 'peek' ? 'true' : 'false'}
      className="absolute inset-x-2 bottom-2 z-[1100] flex flex-col overflow-hidden rounded-card border border-divider-strong bg-bg-elevated shadow-card will-change-transform"
      style={{
        height: openHeight,
        transform: `translateY(${translateY}px)`,
        transition: animating && !reduced ? 'transform 260ms cubic-bezier(0.32,0.72,0,1)' : undefined,
      }}
      onTransitionEnd={() => setAnimating(false)}
    >
      {/* Grabber — alça real (não uma faixa vazia): arrasto 1:1 + toque
          percorre os estados. O toggle de filtros (peek↔half) fica por cima,
          à direita — mesmo contrato «Mostrar/Ocultar filtros» do HUD antigo. */}
      <div className="relative shrink-0" style={{ height: GRABBER_H }}>
        <button
          type="button"
          aria-label={isPt ? 'Painel do mapa — arrastar ou tocar para mudar de estado' : 'Map panel — drag or tap to change state'}
          aria-expanded={state !== 'peek'}
          data-sheet-grabber
          className="absolute inset-0 flex w-full cursor-grab items-center justify-center active:cursor-grabbing touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={settle}
          onPointerCancel={settle}
          onClick={onGrabberClick}
        >
          <span className="h-1 w-10 rounded-full bg-fg-disabled" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onExitFullscreen}
          aria-label={exitFullscreenLabel}
          title={exitFullscreenLabel}
          data-map-exit-fullscreen
          className="absolute left-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2/[0.08] hover:text-fg"
        >
          <Minimize2 className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onStateChange(state === 'peek' ? 'half' : 'peek')}
          aria-expanded={state !== 'peek'}
          aria-label={state === 'peek'
            ? (isPt ? 'Mostrar filtros' : 'Show filters')
            : (isPt ? 'Ocultar filtros' : 'Hide filters')}
          className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2/[0.08] hover:text-fg"
        >
          {state === 'peek'
            ? <ChevronUp className="h-4 w-4" aria-hidden />
            : <ChevronDown className="h-4 w-4" aria-hidden />}
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col',
            crossFrom && '[animation:sheet-fade-in_220ms_ease-out_both]',
          )}
        >
          {renderState(state)}
        </div>
        {crossFrom && (
          // `inert` além de aria-hidden: os botões da cópia continuavam
          // focáveis por Tab (aria-hidden só os esconde do leitor de ecrã).
          // String e não boolean: o React 18 só escreve o atributo `inert`
          // se receber string (com `true` avisa e omite-o); os tipos dizem
          // boolean, daí a asserção.
          <div
            aria-hidden
            {...({ inert: '' } as Record<string, string>)}
            className="pointer-events-none absolute inset-0 flex flex-col overflow-hidden [animation:sheet-fade-out_220ms_ease-in_both]"
          >
            {renderState(crossFrom, true)}
          </div>
        )}
      </div>
    </div>
  );
}
