import { cn } from '@/lib/cn';

interface WaveDividerProps {
  className?: string;
  flip?: boolean;
}

/** Organic section divider — gradient ocean fill, gentle drift when motion allowed. */
export default function WaveDivider({ className, flip = false }: WaveDividerProps) {
  return (
    <div
      className={cn(
        'w-full h-10 sm:h-12 pointer-events-none select-none overflow-hidden',
        flip && 'rotate-180',
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 1200 56"
        preserveAspectRatio="none"
        className="w-full h-full block motion-safe:animate-wave-drift"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="ventu-wave-fill" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgb(var(--data-water))" stopOpacity="0.22" />
            <stop offset="45%" stopColor="rgb(var(--data-waves))" stopOpacity="0.28" />
            <stop offset="100%" stopColor="rgb(var(--accent-sunset-3))" stopOpacity="0.12" />
          </linearGradient>
        </defs>
        <path
          fill="url(#ventu-wave-fill)"
          d="M0,32 C120,12 240,48 360,28 C480,8 600,44 720,26 C840,10 960,40 1080,24 C1140,16 1170,20 1200,28 L1200,56 L0,56 Z"
        />
        <path
          fill="rgb(var(--data-waves))"
          fillOpacity="0.12"
          d="M0,40 C180,22 320,52 480,36 C640,20 820,48 1000,34 C1100,26 1150,30 1200,38 L1200,56 L0,56 Z"
        />
      </svg>
    </div>
  );
}
