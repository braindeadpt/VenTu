import type L from 'leaflet';
import type { Spot } from '@/types';
import type { GridSportFilter } from '@/lib/sportRatings';
import { includeSpotInViewportBounds } from './mapViewportBounds';
import { resolveWavePowerKw, MS_TO_KNOTS } from '@/lib/waveEnergy';
import { getCardinalLabel, getWindRelationLabel, getWindRelationToCoast } from '@/lib/wind';
import { getScoreRgb } from '@/lib/map-constants';
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
