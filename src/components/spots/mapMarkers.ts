import type L from 'leaflet';
import type { GridSportFilter } from '@/lib/sportRatings';
import { resolveWavePowerKw, MS_TO_KNOTS } from '@/lib/waveEnergy';
import { getCardinalLabel, getWindRelationLabel, getWindRelationToCoast } from '@/lib/wind';
import { getScoreRgb } from '@/lib/map-constants';
import { buildWindRingMarkerHtml, markerIconLayout } from '@/lib/mapWindArrow';
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
): L.DivIcon {
  const { spot, conditions } = data;
  const score = getBestScore(data, selectedSport);
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
      ? getWindRelationLabel(windRelation, locale === 'pt' ? 'pt' : 'en')
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
    imageUrl: (() => {
      const src = getSpotImage(spot);
      return src.kind === 'image' ? src.src : undefined;
    })(),
    confidence: conditions.confidence,
    confidenceDetail: conditions.confidenceDetail,
  });
}

export function buildMarkerCacheKey(
  data: MapSpotData,
  selectedSport: GridSportFilter,
  showWind: boolean,
  locale: string,
  useMobileSheet: boolean,
): string {
  const score = getBestScore(data, selectedSport);
  const windKey = showWind
    ? `${Math.round(data.conditions.windDirection)}:${Math.round(data.conditions.windSpeed * MS_TO_KNOTS)}`
    : '';
  return [data.spot.id, selectedSport, score, showWind, windKey, locale, useMobileSheet].join(':');
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
  },
): L.Marker {
  const { spot } = data;
  const icon = buildMarkerIcon(Leaflet, data, selectedSport, showWind, locale);
  const marker = Leaflet.marker([spot.lat, spot.lon], { icon });
  (marker as L.Marker & { spotScore?: number }).spotScore = getBestScore(data, selectedSport);

  if (!options.useMobileSheet) {
    marker.bindPopup(buildMarkerPopupContent(data, locale, selectedSport), {
      className: 'spot-popup',
      maxWidth: 280,
      closeButton: true,
      autoClose: true,
      closeOnClick: false,
    });

    marker.on('popupopen', () => {
      const el = marker.getElement();
      if (el) {
        const wrap = el.querySelector('.ventu-spot-marker-wrap') as HTMLElement | null;
        if (wrap) wrap.classList.add('ventu-marker-selected');
      }

      const root = marker.getPopup()?.getElement();
      if (!root) return;

      const detailBtn = root.querySelector('.ventu-popup-detail');
      if (detailBtn) {
        detailBtn.addEventListener(
          'click',
          (ev) => {
            if (!options.onSpotSelect) return;
            ev.preventDefault();
            ev.stopPropagation();
            options.onSpotSelect(spot.id);
            marker.closePopup();
          },
          { once: true },
        );
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
