'use client';

import { useEffect, useRef, useState } from 'react';
import {
  rasterTileLayerOptions,
  getEsriRasterBasemap,
  bindRasterTileFallback,
  MAX_ZOOM,
} from '@/lib/map-constants';

interface SpotMapProps {
  lat: number;
  lon: number;
  locale?: string;
  /** Fills parent height (e.g. logistics panel). */
  compact?: boolean;
  /** Hide floating OSM link (parent provides actions). */
  hideOverlay?: boolean;
}

/**
 * Spot logistics map — deliberately minimal Leaflet: basemap + spot marker +
 * attribution, and nothing else. The data layers (isobaths, radar, coastal
 * nav warnings) live on /mapa, one click away from the links row. On a card
 * this small every extra control collided with the CC-BY attribution strip,
 * which must stay readable (legal requirement, not just polish).
 */
export default function SpotMap({
  lat,
  lon,
  locale = 'pt',
  compact = false,
  hideOverlay = false,
}: SpotMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const isPt = locale === 'pt';

  useEffect(() => {
    const container = mapRef.current;
    if (!container) return;

    let cancelled = false;
    let map: import('leaflet').Map | null = null;
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
      tileLayer = null;
    };

    (async () => {
      try {
        await Promise.all([import('leaflet/dist/leaflet.css')]);
        const Leaflet = (await import('leaflet')).default;
        if (cancelled || !container) return;

        const isDark = !document.documentElement.classList.contains('theme-ocean');
        map = Leaflet.map(container, {
          center: [lat, lon],
          zoom: 13,
          zoomControl: false,
          attributionControl: false,
          // Compact embedded map — page scroll must not zoom the map.
          scrollWheelZoom: false,
        });

        const { url, ...opts } = rasterTileLayerOptions(isDark);
        tileLayer = Leaflet.tileLayer(url, opts);
        bindRasterTileFallback(tileLayer, () => {
          if (!map || !Leaflet) return;
          try { map.removeLayer(tileLayer!); } catch { /* noop */ }
          const esri = getEsriRasterBasemap(isDark);
          tileLayer = Leaflet.tileLayer(esri.url, {
            attribution: esri.attribution,
            maxZoom: MAX_ZOOM,
          }).addTo(map);
        });
        tileLayer.addTo(map);

        // Attribution bottom-right, never covered: this map mounts no
        // floating controls, so the CC-BY strip always stays readable.
        Leaflet.control.attribution({ prefix: false }).addTo(map);

        // Spot marker — circleMarker (no icon assets).
        Leaflet.circleMarker([lat, lon], {
          radius: 7,
          color: '#ffffff',
          weight: 2,
          fillColor: '#3b82f6',
          fillOpacity: 1,
        }).addTo(map);

        map.invalidateSize({ animate: false });
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return teardown;
  }, [lat, lon, isPt]);

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
      {!hideOverlay && (
        <a
          href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`}
          target="_blank"
          rel="noopener noreferrer"
          // Top-left: the only corner guaranteed free — Leaflet attribution
          // owns the bottom-right strip and must stay uncovered.
          className="absolute top-3 left-3 text-xs text-fg-muted hover:text-fg bg-bg-base/90 px-3 py-1.5 rounded-lg border border-divider z-10"
        >
          {isPt ? 'Abrir mapa' : 'Open map'} ↗
        </a>
      )}
    </div>
  );
}
