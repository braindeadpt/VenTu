'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CloudRain, RotateCcw } from 'lucide-react';
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
import RadarCarousel from './RadarCarousel';
import {
  fetchRadarData,
  radarBoundsCorners,
  radarFrames,
  type IpmaRadarData,
} from '@/lib/ipmaRadar';
import {
  IPMA_RADAR_ATTRIBUTION_LABEL_PT,
  IPMA_RADAR_ATTRIBUTION_LABEL_EN,
} from '@/lib/ipmaAttribution';
import {
  readRadarEnabledPref,
  readRadarPref,
  writeRadarEnabledPref,
  writeRadarPref,
  resetRadarPref,
} from '@/lib/radarPrefs';
import { getTranslation, validateLocale } from '@/lib/i18n';
import { rasterTileLayerOptions, getEsriRasterBasemap, bindRasterTileFallback, MAX_ZOOM } from '@/lib/map-constants';

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
  /** O mapa Leaflet está criado e fitBounds feito — o radar (e futuras camadas
   *  que precisem da instância) só arranca depois disto. Sem este flag, um
   *  radar restaurado da preferência no mount corria ANTES do mapa existir e
   *  nunca mais tentava (o clique funciona porque o mapa já lá está). */
  const [mapReady, setMapReady] = useState(false);
  /** As isóbatas estão desenhadas no mapa → mostrar a legenda de profundidade. */
  const [isobathsVisible, setIsobathsVisible] = useState(false);
  /** IPMA radar overlay — a MESMA camada partilhada do grid/hero/fullscreen. */
  const [radarData, setRadarData] = useState<IpmaRadarData | null | undefined>(undefined);
  const [radarEnabled, setRadarEnabled] = useState<boolean>(() => readRadarEnabledPref() === true);
  /** O utilizador já gravou uma preferência (liga/desliga) — o botão de
   *  reinício só aparece quando há algo para repor (o deep link não conta). */
  const [radarPrefSet, setRadarPrefSet] = useState<boolean>(() => readRadarEnabledPref() !== undefined);
  const [radarUserPaused, setRadarUserPaused] = useState<boolean>(() => readRadarPref().paused);
  const [radarFrameIndex, setRadarFrameIndex] = useState(0);
  const radarFrameIndexRef = useRef(0);
  const radarUserPausedRef = useRef(radarUserPaused);
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null);
  const radarOverlayRef = useRef<import('leaflet').ImageOverlay | null>(null);
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
      mapInstanceRef.current = null;
      radarOverlayRef.current = null;
      setMapReady(false);
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
        mapInstanceRef.current = map;

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
        if (!cancelled) setMapReady(true);
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return teardown;
  }, [lat, lon, isPt, spotId]);

  // ── IPMA radar overlay ──
  // A mesma camada partilhada dos outros mapas: metadata lazy na primeira
  // activação (cache module-level) e L.imageOverlay com os bounds oficiais do
  // IPMA. A preferência ligar/desligar e o frame/pausa são partilhadas com o
  // grid/hero/fullscreen (mesmas keys do localStorage), para o radar ligado na
  // página do spot aparecer ligado nos outros mapas e vice-versa.
  const toggleRadar = useCallback(() => {
    setRadarPrefSet(true);
    setRadarEnabled((prev) => {
      const next = !prev;
      writeRadarEnabledPref(next);
      if (!next) {
        writeRadarPref(radarUserPausedRef.current, radarFrameIndexRef.current);
      }
      return next;
    });
  }, []);

  /** Link de imersão (→ /mapa?radar=1): persiste o estado ACTUAL (frame +
   *  pausa) antes de navegar, para o /mapa entrar exactamente onde o
   *  carrossel ficou no spot — mesmo um frame de scrub transitório (que só
   *  grava quando pausado). */
  const handleRadarImmersionOpen = useCallback(() => {
    writeRadarPref(radarUserPausedRef.current, radarFrameIndexRef.current);
  }, []);

  /** Botão de reinício: repõe a preferência do radar ao default (off) e
   *  limpa a pausa/frame persistidos — mesmo contrato do HUD do grid/hero. */
  const handleResetRadar = useCallback(() => {
    resetRadarPref();
    radarUserPausedRef.current = false;
    radarFrameIndexRef.current = 0;
    setRadarUserPaused(false);
    setRadarFrameIndex(0);
    setRadarEnabled(false);
    setRadarPrefSet(false);
  }, []);

  const handleRadarUserPausedChange = useCallback((paused: boolean) => {
    radarUserPausedRef.current = paused;
    setRadarUserPaused(paused);
    writeRadarPref(paused, radarFrameIndexRef.current);
  }, []);

  const handleRadarFrameChange = useCallback((value: number) => {
    const frames = radarFrames(radarData ?? null);
    if (frames.length === 0) return;
    const v = Math.max(0, Math.min(frames.length - 1, value));
    radarFrameIndexRef.current = v;
    setRadarFrameIndex(v);
    radarOverlayRef.current?.setUrl(frames[v].url);
    if (radarUserPausedRef.current) writeRadarPref(true, v);
  }, [radarData]);

  useEffect(() => {
    if (!radarEnabled) {
      if (radarOverlayRef.current) {
        mapInstanceRef.current?.removeLayer(radarOverlayRef.current);
        radarOverlayRef.current = null;
      }
      return;
    }
    // Só arranca com o mapa criado (mapReady) — um radar restaurado da
    // preferência no mount re-corre quando o flag muda.
    if (!mapReady || !mapInstanceRef.current) return;
    let cancelled = false;

    (async () => {
      const Leaflet = (await import('leaflet')).default;
      if (cancelled || !mapInstanceRef.current) return;
      if (radarData === undefined) {
        const data = await fetchRadarData();
        if (!cancelled) setRadarData(data);
        return;
      }
      if (!radarData) return; // indisponível — nada a mostrar
      const frames = radarFrames(radarData);
      if (frames.length === 0) return;
      // Restaura o frame escolhido pelo utilizador (persistido) em vez de
      // começar sempre no mais recente.
      const savedFrame = Math.max(0, Math.min(frames.length - 1, readRadarPref().frame));
      radarFrameIndexRef.current = savedFrame;
      setRadarFrameIndex(savedFrame);
      const overlay = Leaflet.imageOverlay(
        frames[savedFrame].url,
        Leaflet.latLngBounds(radarBoundsCorners(radarData)),
        {
          opacity: 0.8,
          attribution: radarData.attribution ?? 'IPMA',
        },
      ).addTo(mapInstanceRef.current);
      radarOverlayRef.current = overlay;
    })();

    return () => {
      cancelled = true;
      if (radarOverlayRef.current) {
        mapInstanceRef.current?.removeLayer(radarOverlayRef.current);
        radarOverlayRef.current = null;
      }
    };
  }, [radarEnabled, radarData, mapReady]);

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

  const radarLabel = radarEnabled ? t.map.hideRadar : t.map.showRadar;
  const ipmaRadarAttributionLabel = isPt
    ? IPMA_RADAR_ATTRIBUTION_LABEL_PT
    : IPMA_RADAR_ATTRIBUTION_LABEL_EN;
  const radarFrameList = radarFrames(radarData ?? null);

  return (
    <div className={shellClass}>
      <div ref={mapRef} className="absolute inset-0 w-full h-full" />
      {/* Radar IPMA — o mesmo carrossel partilhado do grid/hero/fullscreen, com
          a preferência ligar/desligar e o frame/pausa nas mesmas keys. No mapa
          compacto do spot o carrossel ancorra em baixo à direita: a legenda de
          isóbatas é bottom-left, a atribuição Leaflet é o strip da base e o
          toggle fica top-right — nenhum controlo fica tapado em desktop (em
          mobile o painel é estreito e cobre só o canto). */}
      <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 pointer-events-auto">
        <button
          type="button"
          onClick={toggleRadar}
          aria-label={radarLabel}
          aria-pressed={radarEnabled}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-meta-sm font-medium text-fg bg-bg-elevated/90 border border-divider shadow-card backdrop-blur-sm hover:bg-bg-elevated transition-colors"
        >
          <CloudRain className="w-3.5 h-3.5 text-data-waves" aria-hidden />
          <span className="hidden sm:inline">{radarLabel}</span>
        </button>
        {/* Reinício: repõe a preferência ao default (off) — mesmo contrato do
            HUD do grid/hero. Visível só quando há preferência gravada. */}
        {(radarPrefSet || radarEnabled) && (
          <button
            type="button"
            onClick={handleResetRadar}
            aria-label={t.map.radarReset}
            title={t.map.radarReset}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-meta-sm font-medium text-fg bg-bg-elevated/90 border border-divider shadow-card backdrop-blur-sm hover:bg-bg-elevated transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden />
          </button>
        )}
      </div>
      {radarEnabled && radarData && (
        <RadarCarousel
          className="absolute bottom-8 right-2 z-[1000] max-w-[min(100%,320px)] sm:max-w-none"
          frames={radarFrameList}
          frameIndex={radarFrameIndex}
          onFrameChange={handleRadarFrameChange}
          userPaused={radarUserPaused}
          onUserPausedChange={handleRadarUserPausedChange}
          labels={{
            badge: t.map.radarBadge,
            hint: t.map.radarHint,
            scrub: t.map.radarScrub,
            play: t.map.radarPlay,
            pause: t.map.radarPause,
            paused: t.map.radarPaused,
            ipmaAttribution: ipmaRadarAttributionLabel,
            gap: t.map.radarGap,
          }}
          // Imersão: abrir o /mapa (ecrã inteiro) com o radar já ligado E
          // centrado na região deste spot (?radar=1&lat=&lon=). O clique
          // persiste o frame/pausa actuais para o deep link entrar exactamente
          // onde o carrossel ficou no spot.
          fullscreenHref={`/${locale}/mapa/?radar=1&lat=${lat}&lon=${lon}`}
          fullscreenLabel={t.map.radarFullscreen}
          onFullscreenOpen={handleRadarImmersionOpen}
        />
      )}
      {/* A legenda cede enquanto o radar está ligado: o carrossel ocupa a
          banda inferior do mapa compacto (e o overlay pinta por cima das
          linhas) — as isóbatas continuam desenhadas, só o rótulo espera. */}
      {isobathsVisible && !radarEnabled && (
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
