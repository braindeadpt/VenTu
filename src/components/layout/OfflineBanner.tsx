'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

const LAST_UPDATE_KEY = 'ventu:last-data-update';

function formatTime(iso: string, locale: 'pt' | 'en'): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(locale === 'pt' ? 'pt-PT' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [locale, setLocale] = useState<'pt' | 'en'>('pt');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setLocale(window.location.pathname.startsWith('/en') ? 'en' : 'pt');
    setOffline(!navigator.onLine);

    try {
      setLastUpdate(localStorage.getItem(LAST_UPDATE_KEY));
    } catch { /* noop */ }

    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  useEffect(() => {
    if (!offline || typeof window === 'undefined') return;

    fetch('/data/conditions.json', { cache: 'force-cache' })
      .then((res) => {
        const cachedAt = res.headers.get('x-ventu-cached-at');
        if (cachedAt) {
          const iso = new Date(Number(cachedAt)).toISOString();
          setLastUpdate(iso);
          try { localStorage.setItem(LAST_UPDATE_KEY, iso); } catch { /* noop */ }
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.updatedAt) {
          setLastUpdate(data.updatedAt);
          try { localStorage.setItem(LAST_UPDATE_KEY, data.updatedAt); } catch { /* noop */ }
        }
      })
      .catch(() => { /* keep stored value */ });
  }, [offline]);

  if (!offline) return null;

  const isPt = locale === 'pt';
  const timeLabel = lastUpdate ? formatTime(lastUpdate, locale) : (isPt ? 'desconhecida' : 'unknown');

  return (
    <div
      className="fixed top-0 inset-x-0 z-[60] bg-score-poor/95 text-fg border-b border-score-poor/40 px-4 py-2 text-center text-sm"
      role="status"
    >
      <span className="inline-flex items-center gap-2">
        <WifiOff className="w-4 h-4 shrink-0" />
        {isPt
          ? `Offline — a mostrar dados de ${timeLabel}`
          : `Offline — showing data from ${timeLabel}`}
      </span>
    </div>
  );
}
