'use client';

import { useEffect, useRef, useState } from 'react';
import {
  loadCoastalNavWarnings,
  warningsForSpot,
} from '@/lib/ihCoastalWarnings';
import {
  loadIsobathContours,
  contoursWithinRadius,
  ISOBATH_DEPTH_STYLE,
} from '@/lib/isobaths';
import IsobathLegend from './IsobathLegend';
import { getTranslation, validateLocale } from '@/lib/i18n';
import { TILE_URLS, TILE_ATTRIBUTIONS, MAX_ZOOM } from '@/lib/map-constants';

interface SpotMapProps {
  lat: number;
  lon: number;
  locale?: string;
  /** Fills parent height (e.g. logistics panel). */
  compact?: boolean;
  /** Hide floating OSM link (parent provides actions). */
  hideOverlay?: boolean;
  /**
   * Spot id — when provided, the IH coastal navigation warnings covering the
   * spot (nav_warning_coastal) are drawn as a polygon overlay on the map, so
   * the covered area is visible next to the text block.
   */
  spotId?: string;
}

/**
 * Spot page map. Leaflet (shared tile stack + attribution) instead of the old
 * OSM iframe so the IH coastal warning polygons can be drawn on top. When the
 * spot has a warning in force, the polygon(s) render with the ref + category
 * in the tooltip and the view fits the covered area + the spot marker.
 */
export default function SpotMap({
  lat,
  lon,
  locale = 'pt',
  compact = false,
  hideOverlay = false,
  spotId,
}: SpotMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  /** As isóbatas estão desenhadas no mapa → mostrar a legenda de profundidade. */
  const [isobathsVisible, setIsobathsVisible] = useState(false);
  const isPt = locale === 'pt';
  const t = getTranslation(validateLocale(locale));

  useEffect(() => {
    const container = mapRef.current;
    if (!container) return;

    let cancelled = false;
    let map: import('leaflet').Map | null = null;
    let polygonLayer: import('leaflet').LayerGroup | null = null;
    let isobathLayer: import('leaflet').LayerGroup | null = null;
    let marker: import('leaflet').CircleMarker | null = null;
    let attributionControl: import('leaflet').Control.Attribution | null = null;
    let tileLayer: import('leaflet').TileLayer | null = null;

    const teardown = () => {
      cancelled = true;
      if (map) {
        try {
          map.remove();
        } catch {
          /* noop */
        }
        map = null;
      }
      polygonLayer = null;
      isobathLayer = null;
      marker = null;
      attributionControl = null;
      tileLayer = null;
      setIsobathsVisible(false);
    };

    (async () => {
      try {
        await Promise.all([import('leaflet/dist/leaflet.css')]);
        const Leaflet = (await import('leaflet')).default;
        if (cancelled || !container) return;

        const isDark = !document.documentElement.classList.contains('theme-ocean');
        map = Leaflet.map(container, {
          center: [lat, lon],
          zoom: 14,
          zoomControl: false,
          attributionControl: false,
          // Compact embedded map — page scroll must not zoom the map.
          scrollWheelZoom: false,
        });

        const tileUrl = isDark ? TILE_URLS.dark : TILE_URLS.light;
        tileLayer = Leaflet.tileLayer(tileUrl, {
          attribution: TILE_ATTRIBUTIONS.carto,
          subdomains: 'abcd',
          maxZoom: MAX_ZOOM,
        }).addTo(map);

        attributionControl = Leaflet.control
          .attribution({ prefix: false })
          .addTo(map);

        // Marker do spot — circleMarker (sem assets de ícone).
        marker = Leaflet.circleMarker([lat, lon], {
          radius: 7,
          color: '#ffffff',
          weight: 2,
          fillColor: '#3b82f6',
          fillOpacity: 1,
        }).addTo(map);

        const bounds = Leaflet.latLngBounds([[lat, lon], [lat, lon]]);

        // Overlay dos avisos à navegação costeiros do IH que cobrem o spot.
        if (spotId) {
          const file = await loadCoastalNavWarnings();
          if (cancelled || !map) return;
          const warnings = warningsForSpot(file, spotId);
          const withPolygons =
            warnings?.filter((w) => Array.isArray(w.polygons) && w.polygons.length > 0) ?? [];
          if (withPolygons.length > 0) {
            polygonLayer = Leaflet.layerGroup();
            const escapeHtml = (s: string) =>
              s
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
            for (const w of withPolygons) {
              for (const ring of w.polygons!) {
                // rings são [lon, lat] (GeoJSON) — Leaflet quer [lat, lon].
                const latlngs = ring.map(
                  ([ringLon, ringLat]) => [ringLat, ringLon] as [number, number],
                );
                const url = w.url;
                // Tooltip ligado ao detalhe oficial (geoanavnet.hidrografico.pt):
                // com URL é um link clicável; sem URL fica só o texto.
                const tooltipHtml = url
                  ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(w.ref)}${w.category ? ` — ${escapeHtml(w.category)}` : ''} ↗</a>`
                  : `${escapeHtml(w.ref)}${w.category ? ` — ${escapeHtml(w.category)}` : ''}`;
                const poly = Leaflet.polygon(latlngs, {
                  color: '#ef4444',
                  weight: 2,
                  opacity: 0.9,
                  fillColor: '#ef4444',
                  fillOpacity: 0.18,
                }).bindTooltip(tooltipHtml, {
                  sticky: true,
                  direction: 'top',
                  interactive: true,
                });
                // Clique no polígono abre o aviso no geoanavnet (nova aba).
                if (url) {
                  poly.on('click', (e) => {
                    Leaflet.DomEvent.stopPropagation(e);
                    window.open(url, '_blank', 'noopener,noreferrer');
                  });
                }
                poly.addTo(polygonLayer);
                for (const ll of latlngs) bounds.extend(ll);
              }
            }
            polygonLayer.addTo(map);
            // Atribuição do IH (CC-BY 4.0) junto do basemap quando há overlay.
            attributionControl?.addAttribution(
              isPt
                ? 'Avisos à Navegação Costeiros © Instituto Hidrográfico (CC BY 4.0)'
                : 'Coastal Navigation Warnings © Instituto Hidrográfico (CC BY 4.0)',
            );
            container.dataset.coastalPolygons = 'true';
          }
        }

        // Overlay das isóbatas 8/16/30 m (IH) — camada vectorial perto do
        // spot (raio 14 km), com a legenda de profundidade. Geometria lazy e
        // simplificada; a falha da camada nunca quebra o mapa.
        const contours = await loadIsobathContours();
        if (cancelled || !map) return;
        const localContours = contoursWithinRadius(contours, lat, lon, 14);
        if (localContours.length > 0) {
          isobathLayer = Leaflet.layerGroup();
          for (const { depth, lines } of localContours) {
            const style = ISOBATH_DEPTH_STYLE[depth];
            for (const line of lines) {
              const latlngs = line.map(
                ([ringLon, ringLat]) => [ringLat, ringLon] as [number, number],
              );
              Leaflet.polyline(latlngs, {
                color: style.color,
                weight: 2,
                opacity: 0.85,
              }).addTo(isobathLayer);
            }
          }
          isobathLayer.addTo(map);
          attributionControl?.addAttribution(
            isPt
              ? 'Isóbatas © Instituto Hidrográfico (CC BY 4.0)'
              : 'Isobaths © Instituto Hidrográfico (CC BY 4.0)',
          );
          container.dataset.isobaths = 'true';
          setIsobathsVisible(true);
        }

        if (cancelled || !map) return;
        // Enquadrar: polígonos (área coberta) se existirem, senão o spot.
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15, animate: false });
        map.invalidateSize({ animate: false });
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return teardown;
  }, [lat, lon, isPt, spotId]);

  if (error) {
    return (
      <div className="relative w-full h-56 md:h-72 rounded-2xl overflow-hidden shadow-lg shadow-card ring-1 ring-divider bg-bg-base flex items-center justify-center">
        <div className="text-center p-4">
          <p className="text-fg-muted text-sm mb-2">{isPt ? 'Mapa não disponível' : 'Map unavailable'}</p>
          <a
            href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-data-waves hover:text-data-waves/80 underline"
          >
            {isPt ? 'Ver no OpenStreetMap' : 'View on OpenStreetMap'} ↗
          </a>
        </div>
      </div>
    );
  }

  const shellClass = compact
    ? 'relative w-full h-full min-h-0'
    : 'relative w-full h-56 md:h-72 rounded-2xl overflow-hidden shadow-lg shadow-card ring-1 ring-divider';

  return (
    <div className={shellClass}>
      <div ref={mapRef} className="absolute inset-0 w-full h-full" />
      {isobathsVisible && (
        <IsobathLegend title={t.map.isobathsLegend} />
      )}
      {!hideOverlay && (
        <a
          href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-3 right-3 text-xs text-fg-muted hover:text-fg bg-bg-base/90 px-3 py-1.5 rounded-lg border border-divider z-10"
        >
          {isPt ? 'Abrir mapa' : 'Open map'} ↗
        </a>
      )}
    </div>
  );
}
