import type L from 'leaflet';
import type { Spot } from '@/types';
import type { GridSportFilter } from '@/lib/sportRatings';
import { includeSpotInViewportBounds } from './mapViewportBounds';
import { resolveWavePowerKw, MS_TO_KNOTS } from '@/lib/waveEnergy';
import { getCardinalLabel, getWindRelationLabel, getWindRelationToCoast } from '@/lib/wind';
import { getScoreRgb } from '@/lib/map-constants';
import { getScoreTier } from '@/lib/scoreThresholds';
import { buildWindRingMarkerHtml, markerIconLayout, type MapMarkerWarning } from '@/lib/mapWindArrow';
import { getSpotImage } from '@/lib/spotImage';
import { getSpotDetailHref } from '@/lib/mapSpotDetail';
import { renderSpotPopup } from './SpotPopupContent';
import { getBestScore, type MapSpotData } from './mapSpotData';

export function buildMarkerIcon(
  Leaflet: typeof L,
  data: MapSpotData,
  selectedSport: GridSportFilter,
  showWind: boolean,
  locale: string,
  warning?: MapMarkerWarning | null,
  scoreOverride?: number,
): L.DivIcon {
  const { spot, conditions } = data;
  const score = getBestScore(data, selectedSport, scoreOverride);
  const scoreRgb = getScoreRgb(score);
  const windKtNum = conditions.windSpeed * MS_TO_KNOTS;

  const markerHtml = buildWindRingMarkerHtml(
    score,
    scoreRgb,
    conditions.windDirection,
    windKtNum,
    showWind,
    locale,
    spot.coastOrientation,
    warning,
  );

  const layout = markerIconLayout(showWind);

  return Leaflet.divIcon({
    className: 'spot-marker',
    html: markerHtml,
    iconSize: layout.iconSize,
    iconAnchor: layout.iconAnchor,
    popupAnchor: layout.popupAnchor,
  });
}

export function buildMarkerPopupContent(
  data: MapSpotData,
  locale: string,
  selectedSport: GridSportFilter,
  warning?: MapMarkerWarning | null,
): string {
  const { spot, conditions, allScores } = data;
  const swellH = conditions.swellHeight ?? conditions.waveHeight;
  const swellT = conditions.swellPeriod ?? conditions.wavePeriod;
  const powerKw = resolveWavePowerKw(conditions);
  const sportParam =
    selectedSport !== 'all' && selectedSport !== 'big-wave' ? selectedSport : undefined;

  const windKt = (conditions.windSpeed * MS_TO_KNOTS).toFixed(0);
  const windRelation =
    spot.coastOrientation !== undefined
      ? getWindRelationToCoast(conditions.windDirection, spot.coastOrientation)
      : undefined;
  const windRelationLabel =
    windRelation != null
      ? getWindRelationLabel(windRelation, locale)
      : undefined;

  return renderSpotPopup({
    spot,
    locale,
    detailHref: getSpotDetailHref(locale, spot.slug, sportParam),
    allScores,
    swellHeight: swellH.toFixed(1),
    swellPeriod: swellT.toFixed(0),
    windKnots: windKt,
    windDirection: getCardinalLabel(conditions.windDirection),
    windRelation: windRelationLabel?.label,
    windRelationClass: windRelationLabel?.className,
    windRelationType: windRelation,
    waterTemp: conditions.waterTemp.toFixed(1),
    wavePowerKw: powerKw.toFixed(1),
    conditions,
    highlightSport: selectedSport,
    imageUrl: (() => {
      const src = getSpotImage(spot);
      return src.kind === 'image' ? src.src : undefined;
    })(),
    confidence: conditions.confidence,
    confidenceDetail: conditions.confidenceDetail,
    warning: warning ?? null,
  });
}

export function buildMarkerCacheKey(
  data: MapSpotData,
  selectedSport: GridSportFilter,
  showWind: boolean,
  locale: string,
  useMobileSheet: boolean,
  warningLevel?: string | null,
  scoreOverride?: number,
): string {
  const score = getBestScore(data, selectedSport, scoreOverride);
  const windKey = showWind
    ? `${Math.round(data.conditions.windDirection)}:${Math.round(data.conditions.windSpeed * MS_TO_KNOTS)}`
    : '';
  return [data.spot.id, selectedSport, score, showWind, windKey, locale, useMobileSheet, warningLevel ?? ''].join(':');
}

export function createSpotMarker(
  Leaflet: typeof L,
  data: MapSpotData,
  selectedSport: GridSportFilter,
  locale: string,
  showWind: boolean,
  options: {
    useMobileSheet: boolean;
    onMobileTap?: (data: MapSpotData) => void;
    onSpotSelect?: (spotId: string) => void;
    onMarkerInteract?: () => void;
    warning?: MapMarkerWarning | null;
    scoreOverride?: number;
  },
): L.Marker {
  const { spot } = data;
  const warning = options.warning ?? null;
  const scoreOverride = options.scoreOverride;
  const icon = buildMarkerIcon(Leaflet, data, selectedSport, showWind, locale, warning, scoreOverride);
  const marker = Leaflet.marker([spot.lat, spot.lon], { icon });
  const withMeta = marker as L.Marker & { spotScore?: number; ventuData?: MapSpotData };
  withMeta.spotScore = getBestScore(data, selectedSport, scoreOverride);
  // Dados completos do spot no próprio marcador — o clusterclick do mapa
  // principal escolhe o melhor filho e abre o sheet sem re-buscar (D3).
  withMeta.ventuData = data;
  // Leaflet gives interactive markers role="button" — give them an accessible
  // name so screen readers announce which spot the marker is (axe aria-command-name).
  marker.on('add', () => {
    const el = marker.getElement();
    if (!el) return;
    if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', spot.name);
    // Ponte de hover com a lista «Nesta vista» (M3 §5): a linha liga
    // .ventu-list-hover neste elemento e o hover do marcador realça a linha.
    el.setAttribute('data-spot-id', spot.id);
  });

  if (!options.useMobileSheet) {
    marker.bindPopup(buildMarkerPopupContent(data, locale, selectedSport, warning), {
      className: 'spot-popup',
      maxWidth: 280,
      closeButton: true,
      autoClose: true,
      closeOnClick: false,
      // O autoPan só dispara quando o popup excederia estas margens — mantém
      // o popup fora da coluna de controlos (topo-esquerda, ~260px) e do
      // cartão do HUD (fundo, ~260px), onde o CTA ficava tapado/inclicável.
      // Topo: 64px era exactamente o fundo da barra de controlos horizontal
      // (top-3 + ~54px) — o popup encostava-lhe (2px de sobreposição, apanhado
      // por map-popup-ver-spot); 84px dá folga visível sem abrir buraco.
      autoPanPaddingTopLeft: Leaflet.point(260, 84),
      autoPanPaddingBottomRight: Leaflet.point(24, 260),
    });

    marker.on('popupopen', () => {
      const el = marker.getElement();
      if (el) {
        const wrap = el.querySelector('.ventu-spot-marker-wrap') as HTMLElement | null;
        if (wrap) wrap.classList.add('ventu-marker-selected');
      }

      const root = marker.getPopup()?.getElement();
      if (!root) return;

      // Leaflet reuses the same popup element across open/close cycles, so
      // re-attaching here on every popupopen would stack duplicate click
      // listeners on the persistent anchor nodes (unbounded growth over a
      // long session of browsing spots). Bind each popup's DOM listeners
      // exactly once; the detail handler stays active for every future open
      // and closes the popup when clicked, so behaviour is unchanged.
      if (root.dataset.ventuPopupBound) return;
      root.dataset.ventuPopupBound = '1';

      const detailBtn = root.querySelector('.ventu-popup-detail');
      if (detailBtn) {
        detailBtn.addEventListener('click', (ev) => {
          if (!options.onSpotSelect) return;
          ev.preventDefault();
          ev.stopPropagation();
          options.onSpotSelect(spot.id);
          marker.closePopup();
        });
      }

      root.querySelectorAll('a[href], .ventu-popup-directions').forEach((anchor) => {
        anchor.addEventListener('click', (ev) => ev.stopPropagation());
      });
    });

    marker.on('popupclose', () => {
      const el = marker.getElement();
      if (el) {
        const wrap = el.querySelector('.ventu-spot-marker-wrap') as HTMLElement | null;
        if (wrap) wrap.classList.remove('ventu-marker-selected');
      }
    });
  }

  marker.on('click', (e) => {
    Leaflet.DomEvent.stopPropagation(e);
    options.onMarkerInteract?.();
    if (options.useMobileSheet) {
      options.onMobileTap?.(data);
    }
  });

  return marker;
}

export const MARKER_ADD_CHUNK_SIZE = 25;
/** Mobile: tiny batches + yield so touch stays responsive while markers load */
export const MARKER_ADD_CHUNK_SIZE_MOBILE = 8;
export const MARKER_CHUNK_YIELD_MS_MOBILE = 40;

/**
 * Process items in small batches across animation frames so marker
 * construction and layer adds never freeze the main thread on mobile.
 */
export function runChunked<T>(
  items: T[],
  processBatch: (batch: T[]) => void,
  cancelRef: { current: boolean },
  onDone?: () => void,
  chunkSize = MARKER_ADD_CHUNK_SIZE,
  yieldMs = 0,
): void {
  let i = 0;
  const step = () => {
    if (cancelRef.current) return;
    const batch = items.slice(i, i + chunkSize);
    if (batch.length > 0) processBatch(batch);
    i += chunkSize;
    if (i < items.length) {
      if (yieldMs > 0) {
        window.setTimeout(() => requestAnimationFrame(step), yieldMs);
      } else {
        requestAnimationFrame(step);
      }
    } else {
      onDone?.();
    }
  };
  step();
}

/** @deprecated Use runChunked — kept for callers that only add pre-built markers */
export function addMarkersChunked(
  markers: L.Marker[],
  addBatch: (batch: L.Marker[]) => void,
  cancelRef: { current: boolean },
): void {
  runChunked(markers, addBatch, cancelRef);
}

/**
 * Bounds da vista «Explorar» calculados SÓ das coordenadas — não precisa de
 * marcadores. A regra das ilhas é a mesma do fit inicial
 * (includeSpotInViewportBounds): continente por defeito, ilhas só quando a
 * região filtrada as pede. Devolve null quando não há spots elegíveis.
 */
export function exploreViewBoundsFromSpots(
  spots: ReadonlyArray<{ spot: Spot }>,
  selectedRegion: string,
): [[number, number], [number, number]] | null {
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const d of spots) {
    if (!includeSpotInViewportBounds(d.spot, selectedRegion)) continue;
    const { lat, lon } = d.spot;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  if (!Number.isFinite(minLat)) return null;
  return [[minLat, minLon], [maxLat, maxLon]];
}

/**
 * Moldura que tapa o mapa no modo Explorar em ecrã inteiro. O enquadramento
 * tem de a descontar: sem isso os spots das bordas nascem debaixo dela e não
 * são tocáveis (o Alqueva ficava debaixo do sheet — spec mar-perigoso).
 *  - 'sheet'       mobile: sheet no fundo (inset 8 px + estado fechado,
 *                  ~220 px medidos com o chip de boias).
 *  - 'panel-open'  desktop: painel à esquerda (inset 8 px + 360 px — §5).
 *  - 'panel-rail'  desktop: painel recolhido (inset 8 px + rail 56 px).
 *  - 'none'        mapa embebido, sem sheet nem painel.
 */
export type ExploreChrome = 'none' | 'sheet' | 'panel-open' | 'panel-rail';

export function resolveExploreChrome(
  hasExploreChrome: boolean,
  isMobile: boolean,
  panelCollapsed: boolean,
): ExploreChrome {
  if (!hasExploreChrome) return 'none';
  if (isMobile) return 'sheet';
  return panelCollapsed ? 'panel-rail' : 'panel-open';
}

/** Margem livre entre a moldura e o spot mais próximo dela. */
const CHROME_GAP_PX = 16;

export function exploreFitPadding(
  chrome: ExploreChrome,
  isMobile: boolean,
): { topLeft: [number, number]; bottomRight: [number, number]; westShift: boolean } {
  switch (chrome) {
    case 'sheet':
      return { topLeft: [16, 16], bottomRight: [16, 8 + 220 + CHROME_GAP_PX], westShift: false };
    case 'panel-open':
      // O painel já ocupa o oeste: o desvio para oeste empurrava a costa
      // para debaixo dele. Largura §5 = 360 px (era 348).
      return { topLeft: [8 + 360 + CHROME_GAP_PX, 48], bottomRight: [40, 48], westShift: false };
    case 'panel-rail':
      return { topLeft: [8 + 56 + CHROME_GAP_PX, 48], bottomRight: [40, 48], westShift: true };
    default:
      // Mapas embebidos: mantêm as margens de sempre.
      return isMobile
        ? { topLeft: [16, 16], bottomRight: [16, 190], westShift: false }
        : { topLeft: [40, 48], bottomRight: [40, 110], westShift: true };
  }
}

/**
 * Enquadramento «Explorar» (não-hero): padding para a moldura activa + o
 * bias para oeste que mete a costa PT à direita e abre o Atlântico à
 * esquerda — é de lá que vem o swell. Partilhado pelo arranque (useMapCore,
 * antes do basemap) e pelo re-enquadre por mudança de filtro (useMapMarkers).
 */
export function applyExploreMapFit(
  Leaflet: typeof L,
  map: L.Map,
  bounds: L.LatLngBoundsExpression,
  isMobile: boolean,
  chrome: ExploreChrome = 'none',
): void {
  const pad = exploreFitPadding(chrome, isMobile);
  map.fitBounds(bounds, {
    paddingTopLeft: Leaflet.point(...pad.topLeft),
    paddingBottomRight: Leaflet.point(...pad.bottomRight),
    maxZoom: isMobile ? 9 : 11,
    animate: false,
  });
  // Enquadramento náutico: a costa PT é uma faixa vertical — centrar a
  // bbox deixa metade do ecrã em Espanha. Shift para oeste mete a costa
  // à direita e abre o Atlântico à esquerda. ~9% da largura para oeste;
  // em zoom baixo o bias é menor para não empurrar a costa para a borda.
  if (pad.westShift) {
    const degPerPx = 360 / (256 * 2 ** map.getZoom());
    const shiftPx = map.getZoom() >= 7 ? 140 : 70;
    const c = map.getCenter();
    map.setView([c.lat, c.lng - shiftPx * degPerPx], map.getZoom(), { animate: false });
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * UX v3 (M4) — marcadores por colisão.
 * Algoritmo: função `recluster()` da maquete aprovada
 * (windspot-pt-v2/_audit/ux-v3/maquete-mapa-v3.html) — marcadores completos
 * nunca se sobrepõem; os que colidem ficam pontos na cor do escalão e o
 * melhor do grupo leva um badge «+N» que faz zoomToBounds.
 * ════════════════════════════════════════════════════════════════════════ */

/** Zoom a partir do qual o raio de colisão encolhe (maquete: `st.z < 8.5`). */
export const MARKER_LOD_ZOOM_SPLIT = 8.5;

/**
 * Raio de colisão entre centros de marcadores, em px do contentor.
 * Maquete: 52 px em mobile / 40 px em desktop abaixo de z8.5; 38 px a partir.
 * M4 desvio documentado: o arranque mobile assenta em z6 (fit do continente
 * com o peek de ~228 px) e 52 px só deixava 7 marcadores completos — abaixo
 * do mínimo de aceitação (≥8). 44 px mantém a leitura da maquete e passa.
 * A métrica é Chebyshev (ver planMarkerLayout) — qualquer raio > 34 garante
 * zero sobreposição de bounding boxes entre completos.
 */
export function markerCollisionRadiusPx(zoom: number, isMobile: boolean): number {
  return zoom < MARKER_LOD_ZOOM_SPLIT ? (isMobile ? 44 : 40) : 38;
}

export interface MarkerLayoutItem {
  /** id estável do spot (chave do marcador na cache). */
  id: string;
  /** Posição em px no contentor do mapa (map.latLngToContainerPoint). */
  x: number;
  y: number;
  /** Score activo (hora seleccionada nas 48 h ou condições live). */
  score: number;
}

export interface MarkerLayoutEntry {
  id: string;
  kind: 'full' | 'dot';
  /**
   * Grupo de colisão (só nos marcadores «full»): o próprio + os ids que
   * ficaram pontos. `memberIds.length - 1` é o «+N» do badge e os membros
   * alimentam o zoomToBounds do clique no badge.
   */
  memberIds: string[];
}

/**
 * Decisão de colocação — função pura, tradução directa da `recluster()` da
 * maquete: ordena por score descendente (estável — empates ficam na ordem de
 * entrada) e percorre greedy: cada item livre vira marcador completo e
 * captura como pontos todos os outros ainda livres dentro do raio. `spread`
 * corresponde ao «Mostrar todos» (cluster desligado): tudo fica completo.
 *
 * Desvio da maquete, deliberado: a colisão é Chebyshev (max|dx|,|dy|), não
 * euclidiana. A maquete usa `Math.hypot < R`, que permite dois completos a
 * ~42 px na diagonal — os discos de 34 px não se tocam, mas as bounding
 * boxes intersectam-se (2×6 px), o que falha a aceitação E2E por rectângulos
 * (§6: «zero sobreposições entre completos»). Com Chebyshev, dois completos
 * têm SEMPRE um eixo ≥ raio (> 34) → rects nunca se cruzam, e a densidade
 * nos eixos fica igual à da maquete.
 *
 * Devolve pontos primeiro — a ordem do array é a ordem de inserção no pane,
 * logo os pontos ficam por baixo dos marcadores completos.
 */
export function planMarkerLayout(
  items: readonly MarkerLayoutItem[],
  radiusPx: number,
  spread = false,
): MarkerLayoutEntry[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const used = new Set<string>();
  const dots: MarkerLayoutEntry[] = [];
  const fulls: MarkerLayoutEntry[] = [];
  for (const a of sorted) {
    if (used.has(a.id)) continue;
    used.add(a.id);
    if (spread) {
      fulls.push({ id: a.id, kind: 'full', memberIds: [a.id] });
      continue;
    }
    const memberIds = [a.id];
    for (const b of sorted) {
      if (used.has(b.id)) continue;
      // Chebyshev: separa por eixo — garante rects de 34 px sem intersecção.
      if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) < radiusPx) {
        used.add(b.id);
        memberIds.push(b.id);
      }
    }
    fulls.push({ id: a.id, kind: 'full', memberIds });
    for (const id of memberIds.slice(1)) dots.push({ id, kind: 'dot', memberIds: [] });
  }
  return [...dots, ...fulls];
}

/* ── Contraste do score no marcador (WCAG AA ≥4.5:1) ── */

/**
 * Cores concretas dos escalões por tema (globals.css — `:root` escuro,
 * `.theme-ocean` claro). Exportadas para os testes de contraste; o CSS real
 * usa `rgb(var(--score-*))` e resolve estas mesmas cores.
 */
export const SCORE_TIER_HEX_DARK = {
  epic: '#0EA5E9',
  good: '#10B981',
  fair: '#F59E0B',
  poor: '#F87171',
  closed: '#6B7280',
} as const;
export const SCORE_TIER_HEX_LIGHT = {
  epic: '#0369A1',
  good: '#065F46',
  fair: '#92400E',
  poor: '#B91C1C',
  closed: '#6B7280',
} as const;
/** `rgb(var(--bg-base))` resolvido: slate-950 no tema escuro, slate-50 no claro. */
export const MARKER_INK_DARK_THEME = '#0F172A';
export const MARKER_INK_LIGHT_THEME = '#F8FAFC';
/** Tinta fixa do escalão «closed» (cinza #6B7280 — bg-base escuro falha AA). */
export const MARKER_INK_CLOSED = '#FFFFFF';

/** Luminância relativa WCAG 2.x de uma cor #RRGGBB. */
export function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = chan((n >> 16) & 0xff);
  const g = chan((n >> 8) & 0xff);
  const b = chan(n & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rácio de contraste WCAG entre duas cores #RRGGBB (1–21). */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const [l1, l2] = a >= b ? [a, b] : [b, a];
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * Cor do número no marcador. `rgb(var(--bg-base))` resolve a tinta certa nos
 * dois temas (#0F172A no escuro, #F8FAFC no claro) e passa AA em todos os
 * escalões — excepto «closed» (cinza #6B7280), que no tema escuro ficava a
 * 3.65:1; por isso leva branco fixo (4.79:1 nos dois temas).
 */
export function markerScoreInkCss(score: number): string {
  return getScoreTier(score) === 'closed' ? MARKER_INK_CLOSED : 'rgb(var(--bg-base))';
}

/** Ink resolvido a hex por tema — espelho do que markerScoreInkCss produz no browser. */
export function markerScoreInkHex(score: number, theme: 'dark' | 'light'): string {
  if (getScoreTier(score) === 'closed') return MARKER_INK_CLOSED;
  return theme === 'dark' ? MARKER_INK_DARK_THEME : MARKER_INK_LIGHT_THEME;
}

/* ── Ícones do marcador v3 (divIcon com estilos inline — sem globals.css) ── */

const V3_MARKER_SIZE = 34;
const V3_DOT_HIT = 24;

function escapeHtmlText(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface V3MarkerIconOptions {
  spotId: string;
  score: number;
  /** Membros do grupo de colisão (inclui o próprio) — ≥2 liga o badge «+N». */
  memberIds?: string[];
  /** Tique de vento: direcção PARA onde sopra (graus) — só com vento ligado e z≥8.5. */
  windBlowsToDeg?: number | null;
  /** aria-label do badge «+N» (já localizado). */
  moreAriaLabel?: string;
}

/**
 * Marcador completo da maquete: disco 34 px com a cor do escalão, score em
 * mono 13 px, anel de 2 px bg-base, badge «+N» e tique de vento opcional.
 */
export function buildV3MarkerIcon(Leaflet: typeof L, opts: V3MarkerIconOptions): L.DivIcon {
  const { spotId, score } = opts;
  const members = opts.memberIds ?? [spotId];
  const hasMore = members.length > 1;
  const more = hasMore ? members.length - 1 : 0;
  const tierBg = getScoreRgb(score);
  const ink = markerScoreInkCss(score);
  const tick =
    opts.windBlowsToDeg != null && Number.isFinite(opts.windBlowsToDeg)
      ? `<i class="v3tick" data-wind-tick="true" aria-hidden="true" style="position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none;transform:rotate(${Math.round(opts.windBlowsToDeg)}deg)"><i style="position:absolute;left:-4px;top:-27px;border:4px solid transparent;border-bottom:7px solid rgb(var(--data-wind));border-top:0"></i></i>`
      : '';
  const badge = hasMore
    ? `<span class="v3more" role="button" tabindex="-1" data-v3members="${members
        .map(escapeHtmlText)
        .join(',')}" aria-label="${escapeHtmlText(opts.moreAriaLabel ?? '')}" style="position:absolute;right:-12px;top:-9px;min-width:22px;height:18px;padding:0 5px;border-radius:9px;background:rgb(var(--fg));color:rgb(var(--bg-base));font:600 10px/18px var(--font-geist-mono,ui-monospace,monospace);font-variant-numeric:tabular-nums;text-align:center;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.3)"><i aria-hidden="true" style="position:absolute;inset:-8px"></i>+${more}</span>`
    : '';
  const html = `<div class="v3mk" data-v3spot="${escapeHtmlText(spotId)}" data-v3kind="full" data-spot-score="${Math.round(
    score,
  )}" style="position:relative;width:${V3_MARKER_SIZE}px;height:${V3_MARKER_SIZE}px;cursor:pointer">` +
    `<span class="v3in" style="display:grid;place-items:center;width:100%;height:100%;border-radius:50%;background:${tierBg};color:${ink};font:600 13px/1 var(--font-geist-mono,ui-monospace,monospace);font-variant-numeric:tabular-nums;box-shadow:0 0 0 2px rgb(var(--bg-base)),0 2px 6px rgba(0,0,0,.25);transition:transform .12s ease-out,box-shadow .16s ease-out">${Math.round(
      score,
    )}</span>${tick}${badge}</div>`;
  return Leaflet.divIcon({
    className: 'spot-marker v3mk-root',
    html,
    iconSize: [V3_MARKER_SIZE, V3_MARKER_SIZE],
    iconAnchor: [V3_MARKER_SIZE / 2, V3_MARKER_SIZE / 2],
  });
}

/** Ponto do nível de detalhe por colisão: 10 px na cor do escalão, hit 24 px. */
export function buildV3DotIcon(Leaflet: typeof L, spotId: string, score: number): L.DivIcon {
  const html =
    `<div class="v3dot" data-v3spot="${escapeHtmlText(spotId)}" data-v3kind="dot" data-spot-score="${Math.round(
      score,
    )}" style="position:relative;width:${V3_DOT_HIT}px;height:${V3_DOT_HIT}px;display:grid;place-items:center;cursor:pointer">` +
    `<i style="width:10px;height:10px;border-radius:50%;background:${getScoreRgb(score)};box-shadow:0 0 0 1.5px rgb(var(--bg-base))"></i></div>`;
  return Leaflet.divIcon({
    className: 'spot-marker v3dot-root',
    html,
    iconSize: [V3_DOT_HIT, V3_DOT_HIT],
    iconAnchor: [V3_DOT_HIT / 2, V3_DOT_HIT / 2],
  });
}

export interface V3SpotMarkerOptions {
  selectedSport: GridSportFilter;
  locale: string;
  /** Tique de vento ligado (toggle «Vento nos marcadores» E zoom ≥8.5). */
  showWindTick: boolean;
  reducedMotion: boolean;
  /** Entrada suave: opacity 0→1 em 150 ms (maquete). */
  onOpen: (data: MapSpotData) => void;
  onMarkerInteract?: () => void;
  /** Hover: nome no tooltip (só é usado em ponteiros com hover real). */
  onHover?: (spotId: string | null) => void;
  /** Aria-label do badge «+N» — `{n}` é substituído pela contagem. */
  moreAriaTemplate?: string;
  scoreOverride?: number;
}

/**
 * Marcador Leaflet do nível de detalhe por colisão: full ou dot consoante a
 * decisão de `planMarkerLayout`. O clique abre a pré-visualização (cartão no
 * desktop / sheet no mobile) — nunca navega nem abre popup Leaflet.
 */
export function createV3SpotMarker(
  Leaflet: typeof L,
  data: MapSpotData,
  layout: MarkerLayoutEntry,
  options: V3SpotMarkerOptions,
): L.Marker {
  const { spot } = data;
  const score = getBestScore(data, options.selectedSport, options.scoreOverride);
  const windBlows =
    options.showWindTick && Number.isFinite(data.conditions.windDirection)
      ? (data.conditions.windDirection + 180) % 360
      : null;
  const icon =
    layout.kind === 'full'
      ? buildV3MarkerIcon(Leaflet, {
          spotId: spot.id,
          score,
          memberIds: layout.memberIds,
          windBlowsToDeg: windBlows,
          moreAriaLabel: options.moreAriaTemplate?.replace(
            '{n}',
            String(Math.max(0, layout.memberIds.length - 1)),
          ),
        })
      : buildV3DotIcon(Leaflet, spot.id, score);
  const marker = Leaflet.marker([spot.lat, spot.lon], {
    icon,
    // Pontos por baixo dos completos; o seleccionado sobe acima de todos.
    zIndexOffset: layout.kind === 'dot' ? -1000 : 0,
  });
  const withMeta = marker as L.Marker & { spotScore?: number; ventuData?: MapSpotData };
  withMeta.spotScore = score;
  withMeta.ventuData = data;

  marker.on('add', () => {
    const el = marker.getElement();
    if (!el) return;
    if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', spot.name);
    // Ponte de hover com a lista «Nesta vista» (M3 §5) — igual ao
    // marcador clássico: a linha liga .ventu-list-hover neste elemento e
    // a delegação pointerover lê data-spot-id no sentido inverso.
    el.setAttribute('data-spot-id', spot.id);
    if (options.reducedMotion) return;
    // Entrada da maquete: só opacity, 150 ms — nunca mexer na posição.
    el.style.opacity = '0';
    el.style.transition = 'opacity .15s ease-out';
    requestAnimationFrame(() => {
      el.style.opacity = '1';
    });
  });

  if (!options.reducedMotion) {
    marker.on('mouseover', () => {
      const inner = marker.getElement()?.querySelector<HTMLElement>('.v3in');
      if (inner) inner.style.transform = 'scale(1.08)';
      options.onHover?.(spot.id);
    });
    marker.on('mouseout', () => {
      const inner = marker.getElement()?.querySelector<HTMLElement>('.v3in');
      if (inner && !inner.dataset.v3sel) inner.style.transform = '';
      options.onHover?.(null);
    });
    // O tap móvel não tem hover — o mesmo lift aplica-se por «mouseover» do
    // Leaflet em browsers com toque raro; o onHover também serve o tooltip.
  } else {
    marker.on('mouseover', () => options.onHover?.(spot.id));
    marker.on('mouseout', () => options.onHover?.(null));
  }

  marker.on('click', (e) => {
    Leaflet.DomEvent.stopPropagation(e);
    options.onMarkerInteract?.();
    options.onOpen(data);
  });

  return marker;
}

/** Chave do nível de detalhe — muda o ícone quando o spot muda de papel. */
export function v3LodKey(layout: MarkerLayoutEntry): string {
  return layout.kind === 'dot' ? 'dot' : `full:${layout.memberIds.length}`;
}

/**
 * Ícone novo quando o papel do spot mudou (full↔dot, contagem do badge,
 * tick de vento). Conteúdo (score/idioma) já é coberto pelo ventuKey.
 */
export function applyV3LayoutIcon(
  Leaflet: typeof L,
  marker: L.Marker,
  data: MapSpotData,
  layout: MarkerLayoutEntry,
  options: Pick<V3SpotMarkerOptions, 'selectedSport' | 'showWindTick' | 'moreAriaTemplate' | 'scoreOverride'>,
): void {
  const score = getBestScore(data, options.selectedSport, options.scoreOverride);
  const windBlows =
    options.showWindTick && Number.isFinite(data.conditions.windDirection)
      ? (data.conditions.windDirection + 180) % 360
      : null;
  const icon =
    layout.kind === 'full'
      ? buildV3MarkerIcon(Leaflet, {
          spotId: data.spot.id,
          score,
          memberIds: layout.memberIds,
          windBlowsToDeg: windBlows,
          moreAriaLabel: options.moreAriaTemplate?.replace(
            '{n}',
            String(Math.max(0, layout.memberIds.length - 1)),
          ),
        })
      : buildV3DotIcon(Leaflet, data.spot.id, score);
  marker.setIcon(icon);
  marker.setZIndexOffset(layout.kind === 'dot' ? -1000 : 0);
}
