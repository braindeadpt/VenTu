import { cn } from '@/lib/cn';

interface WaveDividerProps {
  className?: string;
  flip?: boolean;
}

/** Seamless ocean wave between home zones — gentle horizontal drift when motion allowed. */
export default function WaveDivider({ className, flip = false }: WaveDividerProps) {
  return (
    <div
      className={cn(
        'w-full h-8 sm:h-10 md:h-11 pointer-events-none select-none overflow-hidden leading-none',
        flip && 'rotate-180',
        className,
      )}
      aria-hidden
    >
      {/* 200% width + duplicate path → seamless loop at -50% */}
      <svg
        viewBox="0 0 2400 44"
        preserveAspectRatio="none"
        className="block h-full w-[200%] max-w-none motion-safe:animate-wave-drift"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Soft under-swell */}
        <path
          fill="rgb(var(--data-waves))"
          fillOpacity="0.1"
          d="M0,26 C200,10 400,38 600,22 C800,8 1000,34 1200,24 C1400,10 1600,38 1800,22 C2000,8 2200,34 2400,24 L2400,44 L0,44 Z"
        />
        {/* Main crest — fills most of the band so it reads edge-to-edge on desktop */}
        <path
          fill="rgb(var(--data-water))"
          fillOpacity="0.2"
          d="M0,18 C150,4 300,32 450,16 C600,2 750,30 900,14 C1050,4 1150,28 1200,18 C1350,4 1500,32 1650,16 C1800,2 1950,30 2100,14 C2250,4 2350,28 2400,18 L2400,44 L0,44 Z"
        />
        {/* Accent foam line */}
        <path
          fill="none"
          stroke="rgb(var(--accent))"
          strokeOpacity="0.22"
          strokeWidth="1.25"
          d="M0,18 C150,4 300,32 450,16 C600,2 750,30 900,14 C1050,4 1150,28 1200,18 C1350,4 1500,32 1650,16 C1800,2 1950,30 2100,14 C2250,4 2350,28 2400,18"
        />
      </svg>
    </div>
  );
}
