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
import { spotTagEn } from '@/lib/spotTagsEn';
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

function hasText(value: string | undefined | null): boolean {
  if (!value) return false;
  const t = value.trim();
  return t.length > 0 && t !== '—' && t !== '-';
}

export function LocalTipsSection({ spot, tips, locale }: LocalTipsSectionProps) {
  const isPt = locale === 'pt';
  const nearStayUrl = getNearAccommodationUrl(spot.lat, spot.lon);

  const accommodationText = isPt
    ? tips?.accommodation ?? spot.localTips?.accommodation
    : tips?.accommodationEn ?? tips?.accommodation ?? spot.localTips?.accommodationEn ?? spot.localTips?.accommodation;

  const parkingText = isPt
    ? tips?.parking || spot.localTips?.parking
    : tips?.parkingEn || tips?.parking || spot.localTips?.parkingEn;

  const foodText = isPt
    ? tips?.food || spot.localTips?.food
    : tips?.foodEn || tips?.food || spot.localTips?.foodEn;

  const tideText = isPt
    ? tips?.bestTide || spot.localTips?.bestTide
    : tips?.bestTideEn || tips?.bestTide || spot.localTips?.bestTideEn;

  const localRule = isPt
    ? tips?.localRule ?? spot.localTips?.localRule
    : tips?.localRuleEn ?? tips?.localRule ?? spot.localTips?.localRuleEn;

  const cards: TipCard[] = [];

  if (hasText(parkingText)) {
    cards.push({
      id: 'parking',
      icon: Car,
      label: isPt ? 'Estacionamento' : 'Parking',
      body: parkingText,
    });
  }

  if (hasText(foodText)) {
    cards.push({
      id: 'food',
      icon: Utensils,
      label: isPt ? 'Comer' : 'Food',
      body: foodText,
    });
  }

  if (hasText(accommodationText)) {
    cards.push({
      id: 'sleep',
      icon: BedDouble,
      label: isPt ? 'Dormir' : 'Stay',
      body: accommodationText,
    });
  } else {
    cards.push({
      id: 'sleep',
      icon: BedDouble,
      label: isPt ? 'Dormir' : 'Stay',
      body: (
        <a
          href={nearStayUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-data-waves hover:text-data-waves/80 font-medium"
        >
          {isPt ? 'Ver alojamento perto' : 'Find nearby stays'}
          <ExternalLink className="w-3 h-3 shrink-0" aria-hidden />
        </a>
      ),
    });
  }

  if (hasText(tideText)) {
    cards.push({
      id: 'tide',
      icon: Waves,
      label: isPt ? 'Melhor maré' : 'Best tide',
      body: tideText,
    });
  }

  if (hasText(localRule)) {
    cards.push({
      id: 'rule',
      icon: Shield,
      label: isPt ? 'Regra local' : 'Local rule',
      body: localRule,
      highlight: true,
    });
  }

  if (spot.hazards?.length) {
    cards.push({
      id: 'hazards',
      icon: AlertTriangle,
      label: isPt ? 'Perigos' : 'Hazards',
      body: (
        <ul className="list-disc pl-4 space-y-0.5 text-fg-muted m-0">
          {spot.hazards.map((h) => (
            /* EN: nunca o token PT verbatim — spotTagEn (dicionário auditado). */
            <li key={h}>{isPt ? h : spotTagEn(h)}</li>
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
      body: spot.facilities.map((f) => (isPt ? f : spotTagEn(f))).join(' · '),
    });
  }

  if (cards.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.id}
            variant="card-1"
            className={cn(
              'p-3 space-y-1.5',
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
