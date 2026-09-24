'use client';

import { getTranslation } from '@/lib/i18n';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Minimize2, SlidersHorizontal } from 'lucide-react';
import MapSpotList, { type MapListJump, type MapSpotListRow } from './MapSpotList';
import MapExploreFilters, {
  MapFilterSwitch,
  countActiveExploreFilters,
} from './MapExploreFilters';
import MapBasemapRadio from './MapBasemapRadio';
import type { MapLayersMenuItem } from './MapLayersMenu';
import type { MapFullscreenHudProps } from '../../mapHudTypes';
import type { BasemapMode } from '../../MapLayerToggle';
import { getScoreTokens } from '@/lib/sportScore';
import { cn } from '@/lib/cn';

/**
 * Bottom sheet do /mapa em mobile — substitui o cartão «Modo Explorar».
 * Três estados com snap (MAP-UX-V3 §5, maquete aprovada):
 *  - peek (~136 px): cartão «Melhor agora» + [Filtros (n)] · switch
 *    «Só a bombar» · contagem — duas linhas de leitura, sem linhas só-ícone;
 *  - meio: os filtros como no painel + camadas/«Ver também»/legenda;
 *  - aberto: a lista sincronizada.
 *
 * Movimento (apple-design): o sheet tem altura fixa (estado aberto) e anda
 * por translateY — arrasto 1:1 no grabber e no cabeçalho do peek,
 * rubber-band 0.25 fora dos limites, projecção de momentum de 220 ms no
 * release, snap 320 ms cubic-bezier(.32,.72,0,1) ao estado mais próximo.
 * prefers-reduced-motion: snap instantâneo e cross-fade de 150 ms.
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
   *  (mapa/satélite) vive no grupo «Base» da secção Camadas desde a M5
   *  (CORRECCOES-24SET); a saída do fullscreen fica no grabber. */
  extras: SheetToggleItem[];
  /** Saída do fullscreen — sempre visível à esquerda do grabber (era do
   *  HUD antigo; o C4 exige uma saída que não dependa de abrir o sheet). */
  exitFullscreenLabel: string;
  onExitFullscreen: () => void;
  /** Radiogroup «Mapa base» (mapa/satélite) — era do HUD antigo. */
  basemapMode: BasemapMode;
  onBasemapChange: (mode: BasemapMode) => void;
  onlyOnEnabled: boolean;
  onToggleOnlyOn: () => void;
  onlyOnHint: string;
  /** Switch «Agrupar spots» no bloco de filtros (estado partilhado). */
  clusterEnabled: boolean;
  onToggleCluster: () => void;
  /** Kicker do cartão do peek — «Melhor agora» ou «Melhor 17h» (48 h). */
  bestLabel: string;
  /** Nota de ordenação da lista («Ordenado por score · métricas de agora»). */
  noteLabel: string;
  /** Chips «Saltar para» no cabeçalho da lista aberta. */
  jumpLabel: string;
  jumps: MapListJump[];
  onJump: (id: string) => void;
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

const GRABBER_H = 26;
/** Snap «meio» como fração da altura aberta: a maquete usa half = 0.56·vh
 *  e open = 0.88·vh → 0.56/0.88 ≈ 0.636. */
const HALF_RATIO = 0.6364;
/** Snap da maquete: 320 ms, cubic-bezier(.32,.72,0,1). */
const SNAP_MS = 320;
const SNAP_EASE = 'cubic-bezier(0.32,0.72,0,1)';
/** Cross-fade com prefers-reduced-motion (maquete: 150 ms). */
const CROSSFADE_MS = 150;

function AttributionLine({ html }: { html: string }) {
  if (!html) return null;
  return (
    <div
      data-sheet-attribution
      className="shrink-0 truncate pt-0.5 text-[10px] leading-tight text-fg-subtle [&_a]:text-fg-muted [&_a]:underline"
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
      {/* CORRECCOES-24SET (M5/M6): nome completo, nunca truncado. */}
      <span className="min-w-0 text-left leading-snug">{item.label}</span>
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
  basemapMode,
  onBasemapChange,
  exitFullscreenLabel,
  onExitFullscreen,
  onlyOnEnabled,
  onToggleOnlyOn,
  onlyOnHint,
  clusterEnabled,
  onToggleCluster,
  bestLabel,
  noteLabel,
  jumpLabel,
  jumps,
  onJump,
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
  locale,
}: MapExploreSheetProps) {
  const t = getTranslation(locale);
  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // ── Geometria: sheet de altura fixa (open), translateY revela porções ──
  const sheetRef = useRef<HTMLDivElement>(null);
  // O peek mede-se — nomes de spot em duas linhas tornam a altura variável;
  // um ResizeObserver mantém o snap exacto. A maquete fixa o peek em 136 px:
  // o valor medido é clampado a [132,136] — abaixo há faixa morta mínima,
  // acima o conteúdo é cortado pelo overflow-hidden do sheet (a atribuição
  // é a última linha e absorve o corte; os controlos ficam sempre à vista).
  const [peekH, setPeekH] = useState(136);
  const peekContentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = peekContentRef.current;
    if (!el || state !== 'peek') return;
    const measure = () =>
      setPeekH(
        Math.min(136, Math.max(132, GRABBER_H + Math.ceil(el.getBoundingClientRect().height))),
      );
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

  const drag = useRef<{ y0: number; off0: number; t: number; y: number; v: number } | null>(null);

  /** Início do arrasto — no grabber (botão) ou no cabeçalho do peek (div).
   *  No cabeçalho ignoram-se alvos interactivos (maquete: `closest('button,
   *  input,label')`), para o toque nos controlos não virar drag. */
  const startDrag = (e: React.PointerEvent<HTMLElement>) => {
    const el = sheetRef.current;
    if (!el) return;
    if (e.currentTarget instanceof HTMLDivElement) {
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, select, label, [role="switch"]')) return;
    }
    // Interrupção a meio da animação: lê o translateY REAL no ecrã e segue
    // daí — nunca do valor lógico (apple-design §3). Ler via rect contra o
    // offsetParent errava 8 px (o inset `bottom-2` não entra na conta).
    setAnimating(false);
    const m42 = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
    const live = Number.isFinite(m42) && m42 !== 0 ? m42 : offsetRef.current;
    const start = Math.min(Math.max(live, 0), snapsRef.current[0]);
    drag.current = { y0: e.clientY, off0: start, t: performance.now(), y: e.clientY, v: 0 };
    // Capture no elemento que recebeu o pointerdown — no contentor re-alvoava
    // o click para o sheet e o toque deixava de ciclar estados. try/catch:
    // pointerIds sintéticos/inactivos lançam NotFoundError.
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer sem captura possível — o arrasto continua sem capture */
    }
    setDragOffset(start);
  };

  const moveDrag = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    // Velocidade por segmento, como na maquete (`drag.v = dy/dt` em cada
    // pointermove): um flick mede-se pelo último impulso, não por média —
    // uma janela curta podia ficar sem amostras sob CDP lento e o gesto
    // caía para «half» em vez de «open».
    const now = performance.now();
    d.v = (e.clientY - d.y) / Math.max(1, now - d.t);
    d.t = now;
    d.y = e.clientY;
    const max = snapsRef.current[0];
    let next = d.off0 + (e.clientY - d.y0);
    // Rubber-band nos limites (resistência 0.25 da maquete, não hard-stop).
    if (next < 0) next = -((-next * 0.25));
    if (next > max) next = max + (next - max) * 0.25;
    setDragOffset(next);
  };

  // O toque resolve-se no pointerup (distância < 8px); o onClick serve só o
  // teclado/leitores de ecrã (detail === 0). Um click sintético de rato pode
  // chegar >400 ms depois do pointerup sob carga — um guard temporal deixava
  // esse click ciclar outra vez já com o estado novo (half→open→peek).
  const cycleState = () => {
    onStateChange(state === 'peek' ? 'half' : state === 'half' ? 'open' : 'peek');
  };

  const settle = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (Math.abs(e.clientY - d.y0) < 8) {
      // Toque sem arrasto → percorre os estados (peek→half→open→peek).
      // Na maquete a área de arrasto inclui o cabeçalho do peek — um toque
      // no fundo (alvos interactivos já foram excluídos no pointerdown)
      // também cicla.
      setDragOffset(null);
      cycleState();
      return;
    }
    const cur = dragOffset ?? d.off0;
    // Projeção de momentum da maquete (220 ms): snap ao estado mais próximo
    // de onde o gesto ia parar — um flick para cima chega sempre a «open».
    const projected = cur + d.v * 220;
    const targets = snapsRef.current;
    let best = targets[0];
    for (const s of targets) if (Math.abs(s - projected) < Math.abs(best - projected)) best = s;
    setDragOffset(null);
    setAnimating(true);
    onStateChange(best === 0 ? 'open' : best === offsetFor('half') ? 'half' : 'peek');
  };

  const onGrabberClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // detail 0 = activação por teclado/leitor de ecrã (sem pointer events);
    // os cliques de rato/toque já foram resolvidos no pointerup (settle).
    if (e.detail !== 0) return;
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
    const t = setTimeout(() => setCrossFrom(null), CROSSFADE_MS + 20);
    return () => clearTimeout(t);
  }, [state, reduced]);

  const translateY = dragOffset ?? offsetFor(state);
  const best = rows[0] ?? null;
  const bestTok = best ? getScoreTokens(best.score) : null;
  const activeFilters = countActiveExploreFilters({
    sport: selectedSport,
    region: selectedRegion,
    difficulty: selectedDifficulty,
  });

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
      <span className="min-w-0 text-left leading-snug">{item.label}</span>
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
      // Duas linhas de leitura rápida (maquete §5): cartão «Melhor agora»
      // e a linha [Filtros (n)] · «Só a bombar» · «n spots». O cabeçalho
      // inteiro é superfície de arrasto 1:1 (excepto os controlos).
      <div
        ref={s === state && !ghost ? peekContentRef : undefined}
        className="flex shrink-0 cursor-grab flex-col gap-1 px-3 pb-1 active:cursor-grabbing touch-none"
        data-sheet-peek
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={settle}
        onPointerCancel={settle}
      >
        {/* O chip de boias não entra no peek (136 px da maquete = cartão +
            linha de filtros) — vive no estado «half» e no painel desktop. */}
        {best && bestTok ? (
          <button
            type="button"
            onClick={() => onSelectRow(best)}
            className="grid min-h-[48px] grid-cols-[40px_minmax(0,1fr)] items-center gap-2.5 rounded-input border border-divider bg-surface-1/[0.05] px-2 py-1 text-left"
            data-sheet-best
          >
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] font-mono text-sm font-semibold tabular-nums ${bestTok.bg} ${bestTok.text}`}>
              {best.score}
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
                {bestLabel}
              </span>
              <span className="block text-body-sm leading-snug">
                <span className="font-display font-semibold text-fg">{best.name}</span>
                <span className="text-fg-muted"> · {best.region}</span>
              </span>
              {/* Métricas neutras (maquete .best .w — tudo fg-muted). */}
              <span
                className="block truncate font-mono tabular-nums text-meta-sm text-fg-muted"
                data-score-factors={best.factors.map((f) => f.label).join(' · ')}
              >
                {best.factors.map((f, fi) => (
                  <span key={fi}>
                    {fi > 0 && <span aria-hidden className="text-fg-subtle/40"> · </span>}
                    {f.short}
                  </span>
                ))}
              </span>
            </span>
          </button>
        ) : (
          <p className="px-1 py-2 text-meta-sm text-fg-muted">{t.mapUiExplore.emptyView}</p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onStateChange('half')}
            aria-label={t.spotsMap.showFilters}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-input border border-divider bg-surface-1/[0.04] px-2.5 text-meta-sm font-semibold text-fg transition-colors duration-150 hover:bg-surface-2/[0.08]"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-fg-subtle" aria-hidden />
            {activeFilters > 0
              ? t.mapUiExplore.filtersWithCount.replace('{count}', String(activeFilters))
              : t.mapUiExplore.filters}
          </button>
          <div className="min-w-0 flex-1">
            <MapFilterSwitch
              label={t.map.onlyOn}
              checked={onlyOnEnabled}
              onToggle={onToggleOnlyOn}
              hint={onlyOnHint}
              toggleAttr="data-map-only-on-toggle"
            />
          </div>
          <span className="shrink-0 font-mono tabular-nums text-meta-sm text-fg-subtle">
            {spotCount} spots
          </span>
        </div>
        {/* A atribuição do peek vive no grabber (micro-linha à direita) —
            em flow aqui rebentava os 136 px da maquete. */}
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
        {/* «Meio: os filtros como no painel» — mesmo bloco partilhado. */}
        <MapExploreFilters
          idPrefix="m"
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
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-fg-subtle">
            {t.spotsMap.layers}
          </span>
          {/* CORRECCOES-24SET (M5): o basemap saiu do «Ver também» para o
              grupo «Base» da secção Camadas; os toggles agrupam-se por
              Tempo/Mar/Navegação (item.group — maquete §8). */}
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
            {t.mapUiLayers.groupBase}
          </span>
          <MapBasemapRadio value={basemapMode} onChange={onBasemapChange} locale={locale} />
          {/* CORRECCOES-24SET (M5/M6): mobile = 1 coluna com o nome
              completo da camada — duas colunas truncavam «Altura
              significativa (Hs)», «Sinalização náutica»… */}
          <div
            className="grid grid-cols-1 gap-1.5"
            role="group"
            aria-label={t.spotsMap.layers}
          >
            {(['time', 'sea', 'nav'] as const).map((g) => {
              const groupItems = layers.filter((i) => i.group === g);
              if (groupItems.length === 0) return null;
              const groupLabel =
                g === 'time'
                  ? t.mapUiLayers.groupTime
                  : g === 'sea'
                    ? t.mapUiLayers.groupSea
                    : t.mapUiLayers.groupNav;
              return (
                <Fragment key={g}>
                  <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
                    {groupLabel}
                  </span>
                  {groupItems.map((item) => <LayerToggle key={item.key} item={item} />)}
                </Fragment>
              );
            })}
            {layers.filter((i) => !i.group).map((item) => <LayerToggle key={item.key} item={item} />)}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-fg-subtle">
            {t.spotsMap.seeAlso}
          </span>
          <div
            className="grid grid-cols-1 gap-1.5"
            role="group"
            aria-label={t.spotsMap.seeAlso}
          >
            {extras.map(toggleChip)}
          </div>
        </div>
        {legendNode && (
          <details className="rounded-input border border-divider bg-surface-1/[0.03] px-2.5 py-1.5">
            <summary className="flex min-h-[44px] cursor-pointer items-center text-meta-sm font-semibold text-fg-muted">
              {t.spotsMap.legend}
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
          title={t.spotsMap.inView}
          countLabel={`${rows.length} spots`}
          noteLabel={noteLabel}
          emptyLabel={t.mapUiExplore.emptyView}
          hintLabel={t.spotsMap.listFollowsPan}
          jumpLabel={jumpLabel}
          jumps={jumps}
          onJump={onJump}
          focusSpotId={focusSpotId}
          onSelect={onSelectRow}
          listLabel={t.spotsMap.spotsVisibleOnMap}
        />
        <AttributionLine html={attributionHtml} />
      </div>
    );

  return (
    <div
      ref={sheetRef}
      role="region"
      aria-label={t.spotsMap.exploreMode}
      data-explore-sheet={state}
      // Mesmo contrato do HUD antigo: o useMapLayers mede a porção visível
      // (vh − rect.top) para levantar o carrossel do radar e a legenda.
      data-map-hud-collapsed={state === 'peek' ? 'true' : 'false'}
      className="absolute inset-x-2 bottom-2 z-[1100] flex flex-col overflow-hidden rounded-card border border-divider-strong bg-bg-elevated shadow-card will-change-transform"
      style={{
        height: openHeight,
        transform: `translateY(${translateY}px)`,
        transition: animating && !reduced ? `transform ${SNAP_MS}ms ${SNAP_EASE}` : undefined,
      }}
      onTransitionEnd={() => setAnimating(false)}
    >
      {/* Grabber — alça real (não uma faixa vazia): arrasto 1:1 + toque
          percorre os estados. Em «half»/«open» o botão da direita volta ao
          peek («Ocultar filtros»); no peek a entrada é o «Filtros (n)» da
          2ª linha — um único «Mostrar filtros» por estado. */}
      <div className="relative shrink-0" style={{ height: GRABBER_H }}>
        <button
          type="button"
          aria-label={t.spotsMap.mapPanelGrabber}
          aria-expanded={state !== 'peek'}
          data-sheet-grabber
          className="absolute inset-0 flex w-full cursor-grab items-center justify-center active:cursor-grabbing touch-none"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
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
        {state !== 'peek' && (
          <button
            type="button"
            onClick={() => onStateChange('peek')}
            aria-expanded={true}
            aria-label={t.spotsMap.hideFilters}
            className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2/[0.08] hover:text-fg"
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>
        )}
        {/* Atribuição no peek: micro-linha truncada à direita do grabber —
            a obrigação de licença mantém-se visível sem consumir altura
            (nos estados half/open rende em flow no fim do conteúdo). */}
        {state === 'peek' && attributionHtml ? (
          <span
            data-sheet-attribution
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-2 flex max-w-[46%] items-center justify-end truncate text-[9px] leading-none text-fg-subtle [&_a]:text-inherit"
            dangerouslySetInnerHTML={{ __html: attributionHtml }}
          />
        ) : null}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col',
            crossFrom && `[animation:sheet-fade-in_${CROSSFADE_MS}ms_ease-out_both]`,
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
