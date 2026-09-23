'use client';

import { useEffect, useState } from 'react';
import { Waves } from 'lucide-react';
import { getTranslation } from '@/lib/i18n';

const LS_STREAK = 'ventu:dailyStreak';

function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateKey(d);
}

export default function DailyStreak() {
  const [streak, setStreak] = useState(0);
  const [locale, setLocale] = useState<'pt' | 'en'>('pt');

  useEffect(() => {
    const lang = document.documentElement.lang;
    setLocale(lang.startsWith('en') ? 'en' : 'pt');

    try {
      const raw = localStorage.getItem(LS_STREAK);
      const data = raw ? JSON.parse(raw) : null;
      const today = localDateKey();

      if (!data || data.lastDate !== today) {
        const yesterday = yesterdayKey();
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
  const t = getTranslation(locale).layout;

  return (
    <span className="inline-flex items-center gap-1 text-meta-sm text-fg-subtle">
      <Waves className="w-3 h-3" aria-hidden />
      {(streak === 1 ? t.streakOne : t.streakMany).replace('{label}', label)}
    </span>
  );
}
