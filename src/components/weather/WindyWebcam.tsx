'use client';

import { useEffect, useState } from 'react';

interface WindyWebcamProps {
  lat: number;
  lon: number;
  locale: string;
}

export default function WindyWebcam({ lat, lon, locale }: WindyWebcamProps) {
  const [camUrl, setCamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [camName, setCamName] = useState('');

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_WINDY_API_KEY;
    if (!apiKey) {
      setLoading(false);
      return;
    }

    const params = new URLSearchParams({
      nearby: `${lat},${lon},25`,
      include: 'player,location',
      limit: '3',
      lang: locale === 'pt' ? 'pt' : 'en',
    });

    fetch(`https://api.windy.com/webcams/api/v3/webcams?${params}`, {
      headers: { 'x-windy-api-key': apiKey },
    })
      .then(r => r.json())
      .then(data => {
        const cams = data?.webcams ?? [];
        for (const cam of cams) {
          const url = cam.player?.live || cam.player?.day;
          if (url) {
            setCamUrl(url);
            setCamName(cam.location?.city || cam.location?.country || '');
            break;
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [lat, lon, locale]);

  if (loading) return <div className="animate-pulse h-48 bg-gray-800/20 rounded-card" />;
  if (!camUrl) return null;

  return (
    <div className="card-1 p-2">
      <div className="aspect-video rounded-card overflow-hidden bg-black">
        <iframe
          src={camUrl}
          className="w-full h-full"
          allowFullScreen
          loading="lazy"
          title={camName || 'Webcam'}
        />
      </div>
    </div>
  );
}
