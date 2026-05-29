'use client';

import {
  AlertTriangle,
  BedDouble,
  Car,
  ExternalLink,
  Shield,
  ShowerHead,
  Utensils,
  Waves,
} from 'lucide-react';
import type { Spot } from '@/types';
import type { SpotLocalTips } from '@/lib/spotTips';
import { getNearAccommodationUrl } from '@/lib/accommodation';
import Card from '@/components/ui/Card';
import { cn } from '@/lib/cn';

interface LocalTipsSectionProps {
  spot: Spot;
  tips: SpotLocalTips | null;
  locale: string;
}

type TipCard = {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  body: React.ReactNode;
  highlight?: boolean;
};

export function LocalTipsSection({ spot, tips, locale }: LocalTipsSectionProps) {
  const isPt = locale === 'pt';
  const nearStayUrl = getNearAccommodationUrl(spot.lat, spot.lon);

  const accommodationText = isPt
    ? tips?.accommodation ?? spot.localTips?.accommodation
    : tips?.accommodationEn ?? tips?.accommodation ?? spot.localTips?.accommodationEn ?? spot.localTips?.accommodation;

  const cards: TipCard[] = [
    {
      id: 'parking',
      icon: Car,
      label: isPt ? 'Estacionamento' : 'Parking',
      body:
        (isPt
          ? tips?.parking || spot.localTips?.parking
          : tips?.parkingEn || tips?.parking || spot.localTips?.parkingEn) ||
        (isPt ? 'Sem dado — chega cedo em época alta.' : 'No data yet.'),
    },
    {
      id: 'food',
      icon: Utensils,
      label: isPt ? 'Comer' : 'Food',
      body: isPt
        ? tips?.food || spot.localTips?.food || '—'
        : tips?.foodEn || tips?.food || spot.localTips?.foodEn || '—',
    },
    {
      id: 'sleep',
      icon: BedDouble,
      label: isPt ? 'Dormir' : 'Stay',
      body: accommodationText ? (
        <span>{accommodationText}</span>
      ) : (
        <a
          href={nearStayUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-data-waves hover:text-data-waves/80 font-medium"
        >
          {isPt ? 'Ver alojamento perto ↗' : 'Find nearby stays ↗'}
          <ExternalLink className="w-3 h-3 shrink-0" aria-hidden />
        </a>
      ),
    },
    {
      id: 'tide',
      icon: Waves,
      label: isPt ? 'Melhor maré' : 'Best tide',
      body: isPt
        ? tips?.bestTide || spot.localTips?.bestTide || '—'
        : tips?.bestTideEn || tips?.bestTide || spot.localTips?.bestTideEn || '—',
    },
  ];

  const localRule = isPt
    ? tips?.localRule ?? spot.localTips?.localRule
    : tips?.localRuleEn ?? tips?.localRule ?? spot.localTips?.localRuleEn;

  if (localRule) {
    cards.push({
      id: 'rule',
      icon: Shield,
      label: isPt ? 'Regra local' : 'Local rule',
      body: <span>{localRule}</span>,
      highlight: true,
    });
  }

  if (spot.hazards?.length) {
    cards.push({
      id: 'hazards',
      icon: AlertTriangle,
      label: isPt ? 'Perigos' : 'Hazards',
      body: (
        <ul className="list-disc pl-4 space-y-0.5 text-fg-muted">
          {spot.hazards.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      ),
    });
  }

  if (spot.facilities?.length) {
    cards.push({
      id: 'facilities',
      icon: ShowerHead,
      label: isPt ? 'Instalações' : 'Facilities',
      body: (
        <p className="text-fg-muted">
          {spot.facilities.join(isPt ? ' · ' : ' · ')}
        </p>
      ),
    });
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.id}
            variant="card-1"
            className={cn(
              'p-3 space-y-2',
              card.highlight && 'ring-1 ring-score-poor/30 bg-score-poor/[0.06]',
            )}
          >
            <div className="flex items-center gap-2 text-fg-muted">
              <Icon
                className={cn('w-4 h-4 shrink-0', card.highlight ? 'text-score-poor' : undefined)}
                aria-hidden
              />
              <span className="text-meta-sm font-semibold uppercase tracking-wide">{card.label}</span>
            </div>
            <div className="text-body text-fg-muted leading-snug">{card.body}</div>
          </Card>
        );
      })}
    </div>
  );
}
