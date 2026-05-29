'use client';

import { useEffect, useState } from 'react';
import { getDaypart, type Daypart, VENTU_TIMEZONE } from '@/lib/timeOfDay';

const MS_PER_MINUTE = 60_000;

/**
 * Client daypart synced to local PT time; updates on the hour.
 * Sets `data-daypart` on <html> for CSS ambient themes.
 */
export function useDaypart(timeZone: string = VENTU_TIMEZONE): Daypart {
  const [daypart, setDaypart] = useState<Daypart>('day');

  useEffect(() => {
    const apply = () => {
      const next = getDaypart(new Date(), timeZone);
      setDaypart(next);
      document.documentElement.dataset.daypart = next;
    };

    apply();

    const now = new Date();
    const msToNextMinute =
      MS_PER_MINUTE - (now.getSeconds() * 1000 + now.getMilliseconds());
    let hourlyId: number | undefined;

    const alignId = window.setTimeout(() => {
      apply();
      hourlyId = window.setInterval(apply, 60 * MS_PER_MINUTE);
    }, msToNextMinute);

    return () => {
      window.clearTimeout(alignId);
      if (hourlyId) window.clearInterval(hourlyId);
      delete document.documentElement.dataset.daypart;
    };
  }, [timeZone]);

  return daypart;
}
