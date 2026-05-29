import { cn } from '@/lib/cn';

interface WaveDividerProps {
  className?: string;
  /** Flip wave to point upward (section below). */
  flip?: boolean;
}

/**
 * Decorative section divider — gentle drift when motion is allowed.
 */
export default function WaveDivider({ className, flip = false }: WaveDividerProps) {
  return (
    <div
      className={cn(
        'w-full h-8 sm:h-10 text-data-waves/25 pointer-events-none select-none overflow-hidden',
        flip && 'rotate-180',
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 1200 48"
        preserveAspectRatio="none"
        className={cn(
          'w-full h-full block motion-safe:animate-wave-drift',
        )}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fill="currentColor"
          d="M0,24 C150,8 300,40 450,24 S750,8 900,24 S1050,40 1200,24 L1200,48 L0,48 Z"
        />
        <path
          fill="currentColor"
          fillOpacity="0.45"
          d="M0,32 C200,16 400,44 600,28 S1000,12 1200,28 L1200,48 L0,48 Z"
        />
      </svg>
    </div>
  );
}
