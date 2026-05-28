import Skeleton from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="min-h-screen bg-bg-base">
      <div className="sticky top-16 z-30 border-b border-divider bg-surface-1/[0.04]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-10 flex items-center">
          <Skeleton className="h-3 w-48" />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-10 pb-6 space-y-4">
        <Skeleton className="h-4 w-40 mx-auto" />
        <Skeleton className="h-12 w-full max-w-xl mx-auto" />
        <Skeleton className="h-6 w-64 mx-auto" />
        <div className="flex justify-center gap-3 pt-2">
          <Skeleton className="h-12 w-40 rounded-pill" />
          <Skeleton className="h-12 w-32 rounded-pill" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 border-b border-divider">
        <div className="flex gap-2 overflow-hidden pb-1">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-11 w-24 shrink-0 rounded-pill" />
          ))}
        </div>
        <div className="flex gap-2 mt-3 overflow-hidden">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-9 w-20 shrink-0 rounded-md" />
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Skeleton
          className="w-full rounded-card"
          style={{ height: 'clamp(300px, 50vh, 600px)' }}
        />
      </div>
    </div>
  );
}
