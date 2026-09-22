'use client';

import { useCallback, useEffect, useRef } from 'react';
import type L from 'leaflet';
import { useGeolocation } from '@/lib/geolocation';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export interface MapLocateLabels {
  locate: string;
  here: string;
  denied: string;
  unavailable: string;
  timeout: string;
}

/**
 * «Perto de mim» — centra a vista na posição do utilizador e marca-a com
 * um ponto discreto. A permissão só é pedida no clique e a posição nunca
 * sai do browser (sem URL, sem storage, sem analytics).
 */
export function useMapLocate({
  mapInstanceRef,
  isReady,
  labels,
  onToast,
}: {
  mapInstanceRef: React.RefObject<L.Map | null>;
  isReady: boolean;
  labels: MapLocateLabels;
  onToast: (message: string) => void;
}) {
  const { latitude, longitude, error, loading, requestLocation } = useGeolocation();
  const markerRef = useRef<L.Marker | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const labelsRef = useRef(labels);
  const onToastRef = useRef(onToast);
  useEffect(() => {
    labelsRef.current = labels;
    onToastRef.current = onToast;
  });

  const locate = useCallback(() => {
    requestLocation();
  }, [requestLocation]);

  // Posição recebida — centra e (re)marca o ponto «estás aqui».
  useEffect(() => {
    if (latitude == null || longitude == null || !isReady) return;
    const map = mapInstanceRef.current;
    if (!map) return;
    let cancelled = false;
    void (async () => {
      const leaflet = await import('leaflet');
      if (cancelled || !mapInstanceRef.current) return;
      const ll: [number, number] = [latitude, longitude];
      const zoom = Math.max(map.getZoom(), 11);
      if (reducedMotion) map.setView(ll, zoom);
      else map.flyTo(ll, zoom, { duration: 0.6 });
      markerRef.current?.remove();
      markerRef.current = leaflet
        .marker(ll, {
          interactive: false,
          keyboard: false,
          zIndexOffset: 1000,
          icon: leaflet.divIcon({
            className: 'ventu-locate-marker',
            html: `<span class="ventu-locate-dot" role="img" aria-label="${labelsRef.current.here}" style="display:block;width:14px;height:14px;border-radius:9999px;background:rgb(var(--accent));border:2.5px solid rgb(var(--bg-elevated));box-shadow:0 0 0 2px rgb(var(--accent) / 0.35),0 1px 4px rgb(0 0 0 / 0.4)"></span>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
        })
        .addTo(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, isReady, reducedMotion, mapInstanceRef]);

  // Erros — mensagem curta por causa, sem quebrar o mapa.
  useEffect(() => {
    if (!error) return;
    const msg =
      error === 'Location permission denied'
        ? labelsRef.current.denied
        : error === 'Location request timed out'
          ? labelsRef.current.timeout
          : labelsRef.current.unavailable;
    onToastRef.current(msg);
  }, [error]);

  // O ponto sai com o mapa.
  useEffect(
    () => () => {
      markerRef.current?.remove();
      markerRef.current = null;
    },
    [],
  );

  return { locate, locating: loading };
}
