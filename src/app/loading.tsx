export default function Loading() {
  return (
    <div className="min-h-screen bg-ocean-950 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto" />
        <p className="text-white/60 text-sm animate-pulse">
          A carregar condições... 🌊
        </p>
      </div>
    </div>
  );
}
