'use client';

import { useSyncExternalStore } from 'react';
import DawnPatrolBanner from '@/components/DawnPatrolBannerWrapper';
import { isDawnPatrolWindow } from '@/lib/dawnPatrolHours';

function subscribe() {
  return () => {};
}

function getMorningSnapshot() {
  return isDawnPatrolWindow();
}

/** Avoid SSR/client hydration mismatch for time-based Dawn Patrol placement. */
export function DawnPatrolTopSlot({ locale }: { locale: string }) {
  const isMorning = useSyncExternalStore(subscribe, getMorningSnapshot, () => false);

  if (!isMorning) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
      <DawnPatrolBanner locale={locale} />
    </div>
  );
}

export function DawnPatrolBottomSlot({ locale }: { locale: string }) {
  const isMorning = useSyncExternalStore(subscribe, getMorningSnapshot, () => false);

  if (isMorning) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
      <DawnPatrolBanner locale={locale} />
    </div>
  );
}
