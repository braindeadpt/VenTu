'use client';

import { getDirectionArrow } from '@/lib/openmeteo';

interface WindCompassProps {
  direction: number;
  speed: number;
  size?: number;
}

export default function WindCompass({ direction, speed, size = 64 }: WindCompassProps) {
  const arrow = getDirectionArrow(direction);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 64 64" className="transform" style={{ transform: `rotate(${direction}deg)` }}>
        <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
        <text x="32" y="10" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="8" fontWeight="bold">N</text>
        <text x="32" y="58" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="8">S</text>
        <text x="58" y="35" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="8">E</text>
        <text x="6" y="35" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="8">W</text>
        <polygon points="32,8 28,24 32,20 36,24" fill="#38bdf8" className="drop-shadow-lg" />
      </svg>
      <div className="absolute bottom-0 right-0 bg-ocean-900/80 backdrop-blur text-xs font-bold px-1.5 py-0.5 rounded">
        {arrow}
      </div>
    </div>
  );
}