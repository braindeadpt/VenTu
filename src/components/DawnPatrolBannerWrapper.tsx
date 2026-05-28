'use client';

import dynamic from 'next/dynamic';

const DawnPatrolBanner = dynamic(() => import('@/components/DawnPatrolBanner'), {
  ssr: false,
  loading: () => (
    <div className="w-full bg-surface-1/[0.04] border-b border-divider p-5 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-fg-muted/10" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-fg-muted/10 rounded w-32" />
          <div className="h-4 bg-fg-muted/10 rounded w-64" />
          <div className="h-3 bg-fg-muted/10 rounded w-48" />
        </div>
      </div>
    </div>
  ),
});

export default DawnPatrolBanner;
