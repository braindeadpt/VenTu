'use client';

import { useEffect } from 'react';
import { getWindyWebcam } from '@/lib/windyWebcams';

interface WindyWebcamProps {
  slug: string;
  onEmpty?: () => void;
}

export default function WindyWebcam({ slug, onEmpty }: WindyWebcamProps) {
  const cam = getWindyWebcam(slug);

  useEffect(() => {
    if (!cam) onEmpty?.();
  }, [cam, onEmpty]);

  if (!cam) return null;

  return (
    <div className="card-1 p-2">
      <div className="aspect-video rounded-card overflow-hidden bg-black">
        <iframe
          src={cam.playerUrl}
          className="w-full h-full"
          allowFullScreen
          loading="lazy"
          title={cam.name || 'Webcam'}
        />
      </div>
    </div>
  );
}
