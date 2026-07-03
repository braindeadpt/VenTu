'use client';

import { useEffect, useState } from 'react';
import { Waves } from 'lucide-react';

const LS_STREAK = 'ventu:dailyStreak';

export default function DailyStreak() {
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_STREAK);
      const data = raw ? JSON.parse(raw) : null;
      const today = new Date().toISOString().slice(0, 10);

      if (!data || data.lastDate !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const next = data?.lastDate === yesterday
          ? { count: data.count + 1, lastDate: today }
          : { count: 1, lastDate: today };
        localStorage.setItem(LS_STREAK, JSON.stringify(next));
        setStreak(next.count);
      } else {
        setStreak(data.count);
      }
    } catch { /* noop */ }
  }, []);

  if (streak < 2) return null;

  const label = streak >= 7 ? '7+' : String(streak);

  return (
    <span className="inline-flex items-center gap-1 text-meta-sm text-fg-subtle">
      <Waves className="w-3 h-3" aria-hidden />
      {label} {streak === 1 ? 'dia' : 'dias'} seguidos
    </span>
  );
}
