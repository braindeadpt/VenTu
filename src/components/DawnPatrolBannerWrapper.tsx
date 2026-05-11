'use client';

import dynamic from 'next/dynamic';

const DawnPatrolBanner = dynamic(() => import('@/components/DawnPatrolBanner'), {
  ssr: false,
  loading: () => (
    <div className="w-full bg-surface-1 border-b border-divider py-3 px-4 animate-pulse">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <div className="w-5 h-5 rounded-full bg-fg-muted/10" />
        <div className="h-4 bg-fg-muted/10 rounded w-48" />
      </div>
    </div>
  ),
});

export default DawnPatrolBanner;
