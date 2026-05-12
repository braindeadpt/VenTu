'use client';

import { useState } from 'react';
import { MapPin, Clock, Car, Utensils, Shield, ChevronDown, ChevronUp } from 'lucide-react';
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
    <div className="bg-surface-2 backdrop-blur-sm rounded-xl p-5 border border-data-waves/20">
      <div className="flex items-center gap-2 mb-4">
        <MapPin className="w-5 h-5 text-data-waves" />
        <h3 className="text-lg font-bold text-fg">
          {isPT ? 'Dicas do Local' : 'Local Tips'}
        </h3>
      </div>

      <div className="space-y-3">
        {visibleItems.map((item, i) => (
          <div
            key={i}
            className={`flex gap-3 p-3 rounded-lg ${
              item.highlight
                ? 'bg-score-poor/10 border border-score-poor/30'
                : 'bg-surface-1'
            }`}
          >
            <item.icon
              className={`w-4 h-4 mt-0.5 shrink-0 ${
                item.highlight ? 'text-score-poor' : 'text-fg-muted'
              }`}
            />
            <div>
              <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">
                {item.label}
              </p>
              <p className={`text-sm ${item.highlight ? 'text-fg' : 'text-fg-subtle'}`}>
                {item.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {items.length > 2 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-xs text-data-waves hover:text-data-waves/80 transition-colors w-full text-center flex items-center justify-center gap-1"
        >
          {expanded
            ? <>{isPT ? 'Mostrar menos' : 'Show less'} <ChevronUp className="w-3 h-3" /></>
            : <>{isPT ? 'Ver todas as dicas' : 'See all tips'} <ChevronDown className="w-3 h-3" /></>
          }
        </button>
      )}
    </div>
  );
}
