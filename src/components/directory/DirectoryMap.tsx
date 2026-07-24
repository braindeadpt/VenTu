'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DirectoryEntry } from '@/types/directory';
import { kindLabel } from '@/lib/directoryClient';
import {
  CLUSTER_CONFIG,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAX_ZOOM,
  TILE_ATTRIBUTIONS,
  TILE_URLS,
} from '@/lib/map-constants';
import { clearLeafletContainer } from '@/lib/mapFullscreen';
import { createClusterIconFunction } from '@/components/spots/MapClusterIcon';

type Props = {
  entries: DirectoryEntry[];
  locale: string;
  className?: string;
};

function isValidCoord(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 32 && lat <= 43 && lon >= -32 && lon <= -5;
}

function entryHref(entry: DirectoryEntry, locale: string): string {
  if (entry.source !== 'submitted') return `/${locale}/diretorio/${entry.slug}/`;
  return `#${entry.slug}`;
}

export default function DirectoryMap({ entries, locale, className }: Props) {
  const isPt = locale === 'pt';
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const clusterRef = useRef<import('leaflet').MarkerClusterGroup | null>(null);
  const LRef = useRef<typeof import('leaflet') | null>(null);
  const [ready, setReady] = useState(false);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    const teardown = () => {
      try {
        clusterRef.current?.clearLayers();
        mapRef.current?.remove();
      } catch {
        /* noop */
      }
      mapRef.current = null;
      clusterRef.current = null;
      LRef.current = null;
      clearLeafletContainer(container);
      if (!cancelled) setReady(false);
    };

    (async () => {
      const mobile =
        typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

      await Promise.all([
        import('leaflet/dist/leaflet.css'),
        import('leaflet.markercluster/dist/MarkerCluster.css'),
        import('leaflet.markercluster/dist/MarkerCluster.Default.css'),
      ]);
      const Leaflet = (await import('leaflet')).default;
      await import('leaflet.markercluster');
      if (cancelled || !containerRef.current) return;

      clearLeafletContainer(container);
      LRef.current = Leaflet;

      const map = Leaflet.map(container, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: false,
        attributionControl: false,
        ...(mobile ? { renderer: Leaflet.canvas() } : {}),
      });

      if (cancelled) {
        map.remove();
        clearLeafletContainer(container);
        return;
      }

      const dark = !document.documentElement.classList.contains('theme-ocean');
      Leaflet.tileLayer(dark ? TILE_URLS.dark : TILE_URLS.light, {
        attribution: TILE_ATTRIBUTIONS.carto,
        subdomains: 'abcd',
        maxZoom: MAX_ZOOM,
      }).addTo(map);

      Leaflet.control.zoom({ position: 'bottomright' }).addTo(map);
      Leaflet.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);

      const mcg = Leaflet.markerClusterGroup({
        ...CLUSTER_CONFIG,
        ...(mobile ? { chunkInterval: 200, chunkDelay: 80, maxClusterRadius: 72 } : {}),
        iconCreateFunction: createClusterIconFunction(Leaflet, { simple: true }),
      });
      map.addLayer(mcg);
      clusterRef.current = mcg;
      mapRef.current = map;
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
      teardown();
    };
  }, []);

  // Theme tile swap
  useEffect(() => {
    if (!ready || !mapRef.current || !LRef.current) return;
    const map = mapRef.current;
    const L = LRef.current;

    const applyTheme = () => {
      const dark = !document.documentElement.classList.contains('theme-ocean');
      map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) {
          map.removeLayer(layer);
        }
      });
      L.tileLayer(dark ? TILE_URLS.dark : TILE_URLS.light, {
        attribution: TILE_ATTRIBUTIONS.carto,
        subdomains: 'abcd',
        maxZoom: MAX_ZOOM,
      }).addTo(map);
    };

    const obs = new MutationObserver(applyTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [ready]);

  // Markers from filtered entries
  useEffect(() => {
    if (!ready || !mapRef.current || !clusterRef.current || !LRef.current) return;
    const L = LRef.current;
    const map = mapRef.current;
    const mcg = clusterRef.current;

    mcg.clearLayers();
    const pins = entries.filter((e) => isValidCoord(e.lat, e.lon));
    if (pins.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }

    const bounds: [number, number][] = [];
    const viewProfile = isPt ? 'Ver perfil' : 'View profile';
    const onList = isPt ? 'Na lista ↓' : 'In list ↓';

    for (const entry of pins) {
      const name = isPt ? entry.name : entry.nameEn || entry.name;
      const href = entryHref(entry, locale);
      const hasPage = entry.source !== 'submitted';
      const kind = kindLabel(entry.kind, locale);
      const featured = entry.tier === 'featured' || entry.tier === 'pro';

      const icon = L.divIcon({
        className: 'directory-map-marker',
        html: `<span class="directory-map-pin${featured ? ' directory-map-pin--featured' : ''}" aria-hidden="true"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      const marker = L.marker([entry.lat, entry.lon], { icon, title: name });
      const linkLabel = hasPage ? viewProfile : onList;
      marker.bindPopup(
        `<div class="directory-map-popup">
          <p class="directory-map-popup__kind">${kind}</p>
          <p class="directory-map-popup__name">${escapeHtml(name)}</p>
          <a class="directory-map-popup__link" href="${href}">${linkLabel}</a>
        </div>`,
        { className: 'directory-popup', maxWidth: 240 },
      );

      marker.on('click', () => {
        if (hasPage) {
          router.push(href);
        } else {
          const el = document.getElementById(entry.slug);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });

      mcg.addLayer(marker);
      bounds.push([entry.lat, entry.lon]);
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 11);
    } else {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 10 });
    }
  }, [entries, locale, isPt, ready, router]);

  return (
    <section
      className={
        className ??
        'relative w-full h-[clamp(220px,36vh,360px)] rounded-2xl overflow-hidden border border-divider bg-bg-base'
      }
      aria-label={isPt ? 'Mapa do directório' : 'Directory map'}
    >
      <div ref={containerRef} className="absolute inset-0 z-0" />
      {!ready && (
        <div
          className="absolute inset-0 z-[1] animate-pulse bg-surface-1/[0.04]"
          aria-hidden
        />
      )}
      <p className="pointer-events-none absolute left-3 top-3 z-[400] rounded-input border border-divider bg-bg-elevated/95 px-2.5 py-1 text-meta-sm text-fg-muted shadow-sm">
        {isPt
          ? `${entries.filter((e) => isValidCoord(e.lat, e.lon)).length} no mapa`
          : `${entries.filter((e) => isValidCoord(e.lat, e.lon)).length} on map`}
      </p>
    </section>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
