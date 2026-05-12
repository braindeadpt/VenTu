'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface TrendIndicatorProps {
  current: number;
  previous: number;
  label?: string;
}

export default function TrendIndicator({ current, previous, label }: TrendIndicatorProps) {
  const diff = current - previous;
  const percent = previous !== 0 ? ((diff / previous) * 100) : 0;
  
  if (Math.abs(diff) < 0.01) {
    return (
      <span className="flex items-center gap-1 text-fg-subtle text-xs">
        <Minus className="w-3 h-3" />
        {label && <span>{label}</span>}
      </span>
    );
  }
  
  const isUp = diff > 0;
  const color = isUp ? 'text-data-waves' : 'text-data-waves';
  const Icon = isUp ? TrendingUp : TrendingDown;
  
  return (
    <span className={`flex items-center gap-1 ${color} text-xs`}>
      <Icon className="w-3 h-3" />
      {Math.abs(percent).toFixed(0)}%
      {label && <span className="text-fg-subtle ml-1">{label}</span>}
    </span>
  );
}
