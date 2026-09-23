'use client';

interface MapSkeletonProps {
  locale?: string;
}

export default function MapSkeleton({ locale = 'pt' }: MapSkeletonProps) {
  return (
    <div className="relative w-full rounded-surface border border-divider overflow-hidden bg-surface-1/[0.04]" style={{ height: 'clamp(300px, 50vh, 600px)' }}>
      <div className="absolute inset-0 flex items-center justify-center bg-surface-1/[0.04] z-10">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-data-waves/30 border-t-data-waves animate-spin" />
          <span className="text-sm text-fg-muted">
            {getTranslation(locale).spotsMap.loadingMap}
          </span>
        </div>
      </div>
    </div>
  );
}import { getTranslation } from '@/lib/i18n';

