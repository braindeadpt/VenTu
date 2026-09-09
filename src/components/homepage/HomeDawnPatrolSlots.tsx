'use client';

import { useEffect, useState } from 'react';
import DawnPatrolBanner from '@/components/DawnPatrolBannerWrapper';
import WaveDivider from '@/components/ui/WaveDivider';
import { isDawnPatrolWindow } from '@/lib/dawnPatrolHours';

/**
 * No placeholder flash: the slot decision (morning window) needs the live
 * clock, so the markup renders whenever the window matches and CSS hides it
 * until HydrationBeacon stamps .is-hydrated on <html> (see globals.css).
 * The pre-paint bootstrap and the beacon read the same clock within
 * milliseconds, so the reveal is never visible to the eye — no skeleton
 * collapsing/expanding on the homepage.
 */
export function DawnPatrolTopSlot({ locale }: { locale: string }) {
  const [isMorning, setIsMorning] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => setIsMorning(isDawnPatrolWindow());
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!isMorning) return null;

  return (
    <div className="hydration-dawn-slot">
      <WaveDivider flip />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
        <DawnPatrolBanner locale={locale} />
      </div>
    </div>
  );
}

export function DawnPatrolBottomSlot({ locale }: { locale: string }) {
  const [isMorning, setIsMorning] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => setIsMorning(isDawnPatrolWindow());
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  if (isMorning) return null;

  return (
    <div className="hydration-dawn-slot">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <DawnPatrolBanner locale={locale} />
      </div>
    </div>
  );
}
