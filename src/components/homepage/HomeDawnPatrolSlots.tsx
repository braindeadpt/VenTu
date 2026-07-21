'use client';

import { useEffect, useState } from 'react';
import DawnPatrolBanner from '@/components/DawnPatrolBannerWrapper';
import WaveDivider from '@/components/ui/WaveDivider';
import { isDawnPatrolWindow } from '@/lib/dawnPatrolHours';

export function DawnPatrolTopSlot({ locale }: { locale: string }) {
  const [isMorning, setIsMorning] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => setIsMorning(isDawnPatrolWindow());
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  if (isMorning === null || !isMorning) return null;

  return (
    <>
      <WaveDivider flip />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
        <DawnPatrolBanner locale={locale} />
      </div>
    </>
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

  if (isMorning === null || isMorning) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
      <DawnPatrolBanner locale={locale} />
    </div>
  );
}
