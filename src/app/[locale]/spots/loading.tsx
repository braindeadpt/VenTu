import Skeleton from '@/components/ui/Skeleton';

export default function SpotsLoading() {
  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 space-y-6">
        <div className="flex gap-2 overflow-hidden">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-11 w-24 shrink-0 rounded-pill" />
          ))}
        </div>
        <Skeleton className="w-full rounded-card" style={{ height: 'clamp(300px, 50vh, 600px)' }} />
      </div>
    </div>
  );
}
