export default function Loading() {
  return (
    <div className="min-h-screen bg-bg-base animate-pulse">
      {/* Status bar skeleton (sticky below header) */}
      <div className="sticky top-16 z-30 border-b border-divider bg-surface-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-10 flex items-center">
          <div className="h-3 w-48 bg-surface-2 rounded" />
        </div>
      </div>

      {/* Hero / featured headline */}
      <div className="max-w-3xl mx-auto px-4 pt-10 pb-6 space-y-4">
        <div className="h-4 w-40 bg-surface-1 rounded mx-auto" />
        <div className="h-12 w-full max-w-xl bg-surface-1 rounded mx-auto" />
        <div className="h-6 w-64 bg-surface-1 rounded mx-auto" />
        <div className="flex justify-center gap-3 pt-2">
          <div className="h-12 w-40 bg-surface-1 rounded-pill" />
          <div className="h-12 w-32 bg-surface-1 rounded-pill" />
        </div>
      </div>

      {/* Filter bar skeleton */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 border-b border-divider">
        <div className="flex gap-2 overflow-hidden pb-1">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-11 w-24 shrink-0 bg-surface-1 rounded-pill" />
          ))}
        </div>
        <div className="flex gap-2 mt-3 overflow-hidden">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-9 w-20 shrink-0 bg-surface-1 rounded-md" />
          ))}
        </div>
      </div>

      {/* Map skeleton */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div
          className="w-full bg-surface-1 rounded-card border border-divider"
          style={{ height: 'clamp(300px, 50vh, 600px)' }}
        />
      </div>
    </div>
  );
}
