'use client';

import { useState } from 'react';
import { Spot } from '@/types';
import SpotCard from './SpotCard';
import { Filter } from 'lucide-react';

interface SpotGridProps {
  spots: Spot[];
  locale: string;
  conditions?: Record<string, any>;
}

type FilterType = 'all' | 'surf' | 'kitesurf' | 'windsurf' | 'big-wave' | 'foil';

export default function SpotGrid({ spots, locale, conditions = {} }: SpotGridProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  const filteredSpots = filter === 'all' 
    ? spots 
    : spots.filter(s => s.type === filter || (filter === 'surf' && s.type === 'big-wave'));

  const filters: { value: FilterType; label: string }[] = [
    { value: 'all', label: locale === 'pt' ? 'Todos' : 'All' },
    { value: 'surf', label: 'Surf' },
    { value: 'kitesurf', label: 'Kitesurf' },
    { value: 'windsurf', label: 'Windsurf' },
    { value: 'big-wave', label: 'Big Wave' },
    { value: 'foil', label: 'Foil' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
        <Filter className="w-5 h-5 text-white/50 flex-shrink-0" />
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              filter === f.value
                ? 'bg-ocean-500 text-white shadow-lg shadow-ocean-500/25'
                : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSpots.map((spot) => (
          <SpotCard 
            key={spot.id} 
            spot={spot} 
            locale={locale} 
            conditions={conditions[spot.id]}
          />
        ))}
      </div>
    </div>
  );
}