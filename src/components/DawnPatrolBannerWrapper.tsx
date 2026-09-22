'use client';

import dynamic from 'next/dynamic';

const DawnPatrolBanner = dynamic(() => import('@/components/DawnPatrolBanner'), {
  ssr: false,
  loading: () => (
    // Espelha o banner real: mesma moldura (border-l-4 accent), p-5, ícone de
    // 48px (p-2.5 + w-7) e as linhas título/headline/subtítulo — evita o
    // shift de 4px que o skeleton sem a borda esquerda provocava no load (P2).
    <div className="w-full bg-surface-1/[0.04] border-b border-divider border-l-4 border-l-accent p-5 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-fg-muted/10" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 bg-fg-muted/10 rounded" />
          <div className="h-5 w-64 bg-fg-muted/10 rounded" />
          <div className="h-3 w-48 bg-fg-muted/10 rounded" />
        </div>
      </div>
    </div>
  ),
});

export default DawnPatrolBanner;
