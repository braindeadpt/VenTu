'use client';

import { useDaypart } from '@/hooks/useDaypart';

/** Syncs `data-daypart` on <html> for ambient CSS (sunset header, etc.). */
export default function DaypartProvider({ children }: { children: React.ReactNode }) {
  useDaypart();
  return <>{children}</>;
}
