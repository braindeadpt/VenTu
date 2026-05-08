'use client';

import { useState } from 'react';
import { MapPin, Clock, Car, Utensils, Shield } from 'lucide-react';
import { SpotLocalTips } from '@/lib/spotTips';

interface LocalTipsSectionProps {
  tips: SpotLocalTips;
  locale: string;
}

export function LocalTipsSection({ tips, locale }: LocalTipsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const isPT = locale === 'pt';

  const items = [
    {
      icon: Clock,
      label: isPT ? 'Melhor Maré' : 'Best Tide',
      value: isPT ? tips.bestTide : tips.bestTideEn,
    },
    {
      icon: Car,
      label: isPT ? 'Estacionamento' : 'Parking',
      value: isPT ? tips.parking : tips.parkingEn,
    },
    {
      icon: Utensils,
      label: isPT ? 'Onde Comer' : 'Where to Eat',
      value: isPT ? tips.food : tips.foodEn,
    },
    {
      icon: Shield,
      label: isPT ? 'Regra Local' : 'Local Rule',
      value: isPT ? tips.localRule : tips.localRuleEn,
      highlight: true,
    },
  ];

  const visibleItems = expanded ? items : items.slice(0, 2);

  return (
    <div className="bg-slate-800/60 backdrop-blur-sm rounded-xl p-5 border border-cyan-500/20">
      <div className="flex items-center gap-2 mb-4">
        <MapPin className="w-5 h-5 text-cyan-400" />
        <h3 className="text-lg font-bold text-white">
          {isPT ? '🤙 Dicas do Local' : '🤙 Local Tips'}
        </h3>
      </div>

      <div className="space-y-3">
        {visibleItems.map((item, i) => (
          <div
            key={i}
            className={`flex gap-3 p-3 rounded-lg ${
              item.highlight
                ? 'bg-orange-500/10 border border-orange-500/30'
                : 'bg-slate-700/30'
            }`}
          >
            <item.icon
              className={`w-4 h-4 mt-0.5 shrink-0 ${
                item.highlight ? 'text-orange-400' : 'text-slate-400'
              }`}
            />
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                {item.label}
              </p>
              <p className={`text-sm ${item.highlight ? 'text-orange-200' : 'text-slate-200'}`}>
                {item.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {items.length > 2 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-xs text-cyan-400 hover:text-cyan-300 transition-colors w-full text-center"
        >
          {expanded
            ? isPT ? 'Mostrar menos ↑' : 'Show less ↑'
            : isPT ? 'Ver todas as dicas ↓' : 'See all tips ↓'}
        </button>
      )}
    </div>
  );
}
