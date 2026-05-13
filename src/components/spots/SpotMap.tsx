'use client';

import { useEffect, useRef, useState } from 'react';

interface SpotMapProps {
  lat: number;
  lon: number;
  locale?: string;
}

export default function SpotMap({ lat, lon, locale = 'pt' }: SpotMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const isPt = locale === 'pt';

  useEffect(() => {
    if (!mapRef.current) return;

    const iframe = document.createElement('iframe');
    iframe.width = '100%';
    iframe.height = '100%';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '12px';
    iframe.loading = 'lazy';
    iframe.allowFullscreen = true;
    iframe.title = isPt ? `Mapa do spot` : `Spot map`;
    iframe.tabIndex = -1; // prevent focus steal / auto-scroll
    
    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${lon-0.015}%2C${lat-0.015}%2C${lon+0.015}%2C${lat+0.015}&layer=mapnik&marker=${lat}%2C${lon}`;
    iframe.src = url;
    
    iframe.onerror = () => setError(true);

    mapRef.current.innerHTML = '';
    mapRef.current.appendChild(iframe);

    return () => {
      if (mapRef.current) {
        mapRef.current.innerHTML = '';
      }
    };
  }, [lat, lon]);

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

  return (
    <div className="relative w-full h-56 md:h-72 rounded-2xl overflow-hidden shadow-lg shadow-card ring-1 ring-divider">
      <div ref={mapRef} className="w-full h-full" />
      <a 
        href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-3 right-3 text-xs text-fg-muted hover:text-fg bg-bg-base/80 backdrop-blur-sm px-3 py-1.5 rounded-lg transition-all hover:bg-bg-base/90 z-10"
      >
        {isPt ? 'Abrir mapa' : 'Open map'} ↗
      </a>
    </div>
  );
}
