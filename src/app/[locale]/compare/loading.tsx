import Skeleton from '@/components/ui/Skeleton';

export default function CompareLoading() {
  return (
    <div className="min-h-screen bg-bg-base">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <Skeleton className="h-5 w-24" />
        <div className="space-y-3">
          <Skeleton className="h-10 w-64 mx-auto md:mx-0" />
          <Skeleton className="h-5 w-40 mx-auto md:mx-0" />
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-11 w-24 rounded-pill" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-card" />
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2].map(i => (
            <Skeleton key={i} className="h-72 rounded-card" />
          ))}
        </div>
      </div>
    </div>
  );
}
