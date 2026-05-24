import Skeleton from '@/components/ui/Skeleton';

export default function FavoritesLoading() {
  return (
    <div className="min-h-screen bg-bg-base p-4">
      <div className="max-w-4xl mx-auto space-y-8 pt-8">
        <Skeleton className="h-5 w-20" />
        <div className="space-y-3">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-40 rounded-card" />
          ))}
        </div>
      </div>
    </div>
  );
}
