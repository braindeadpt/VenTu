'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('WindSpot Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-ocean-950 flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="p-4 rounded-full bg-red-500/10 mx-auto w-fit">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white/90">
            Algo correu mal 🫠
          </h2>
          <p className="text-white/60 text-sm">
            {error.message || 'Erro ao carregar esta página. Tenta novamente!'}
          </p>
          {error.digest && (
            <p className="text-white/30 text-xs font-mono">
              Ref: {error.digest}
            </p>
          )}
        </div>

        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-medium transition-all hover:scale-105"
        >
          <RefreshCcw className="w-4 h-4" />
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
