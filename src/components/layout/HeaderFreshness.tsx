'use client';

import { useEffect, useState } from 'react';
import FreshnessIndicator from '@/components/ui/FreshnessIndicator';
import { getAssetPath } from '@/lib/paths';

interface HeaderFreshnessProps {
  locale: string;
}

type ConditionEntry = { updatedAt?: string };

export default function HeaderFreshness({ locale }: HeaderFreshnessProps) {
  const [hoursAgo, setHoursAgo] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(getAssetPath('/data/conditions.json'), { cache: 'no-store' });
        if (!res.ok || cancelled) return;

        const data = (await res.json()) as Record<string, ConditionEntry>;
        const timestamps = Object.values(data)
          .map((c) => c?.updatedAt)
          .filter((ts): ts is string => Boolean(ts))
          .map((ts) => new Date(ts).getTime())
          .filter((t) => !Number.isNaN(t));

        if (cancelled) return;

        if (timestamps.length === 0) {
          setHoursAgo(null);
          return;
        }

        const maxTs = Math.max(...timestamps);
        setHoursAgo(Math.max(0, Math.floor((Date.now() - maxTs) / 3600000)));
      } catch {
        if (!cancelled) setHoursAgo(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return <FreshnessIndicator size="sm" hoursAgo={hoursAgo} locale={locale} />;
}
