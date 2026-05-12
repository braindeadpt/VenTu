'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff, Wind, Waves, X } from 'lucide-react';

interface AlertConfig {
  spotId: string;
  spotName: string;
  minScore: number;
  enabled: boolean;
}

export function useAlerts() {
  const [alerts, setAlerts] = useState<AlertConfig[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('windspot-alerts');
        if (stored) {
          setAlerts(JSON.parse(stored));
        }
      } catch {
        // ignore
      }
      setLoaded(true);
    }
  }, []);

  const toggleAlert = (spotId: string, spotName: string) => {
    setAlerts(prev => {
      const exists = prev.find(a => a.spotId === spotId);
      let next;
      if (exists) {
        next = prev.filter(a => a.spotId !== spotId);
      } else {
        next = [...prev, { spotId, spotName, minScore: 70, enabled: true }];
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('windspot-alerts', JSON.stringify(next));
      }
      return next;
    });
  };

  const isAlertSet = (spotId: string) => {
    return alerts.some(a => a.spotId === spotId && a.enabled);
  };

  return { alerts, toggleAlert, isAlertSet, loaded, mounted, count: alerts.length };
}

interface AlertButtonProps {
  spotId: string;
  spotName: string;
  locale?: string;
}

export function AlertButton({ spotId, spotName, locale = 'pt' }: AlertButtonProps) {
  const { isAlertSet, toggleAlert, loaded, mounted } = useAlerts();
  const active = isAlertSet(spotId);
  const isPt = locale === 'pt';

  if (!mounted || !loaded) {
    return <div className="w-5 h-5 animate-pulse bg-surface-1 rounded" />;
  }

  return (
    <div
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleAlert(spotId, spotName);
      }}
      className={`flex items-center gap-1.5 transition-all hover:scale-110 cursor-pointer ${
        active ? 'text-score-fair' : 'text-fg-subtle hover:text-fg-muted'
      }`}
      title={
        active
          ? isPt ? `Alerta ativo para ${spotName}` : `Alert active for ${spotName}`
          : isPt ? `Criar alerta para ${spotName}` : `Create alert for ${spotName}`
      }
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          toggleAlert(spotId, spotName);
        }
      }}
    >
      {active ? <Bell className="w-5 h-5 fill-current" /> : <BellOff className="w-5 h-5" />}
    </div>
  );
}

interface ActiveAlert {
  spotName: string;
  spotSlug: string;
  score: number;
  reason: string;
}

export function AlertBanner({ locale }: { locale: string }) {
  const isPt = locale === 'pt';
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkAlerts = async () => {
      try {
        const stored = localStorage.getItem('windspot-alerts');
        if (!stored) return;
        
        const alerts: AlertConfig[] = JSON.parse(stored);
        if (!alerts.length) return;

        const demoAlerts: ActiveAlert[] = alerts.slice(0, 2).map((a, i) => ({
          spotName: a.spotName,
          spotSlug: a.spotId,
          score: 75 + i * 8,
          reason: i === 0 
            ? (isPt ? 'Ondas boas + offshore' : 'Good waves + offshore')
            : (isPt ? 'Vento ideal para kite' : 'Ideal wind for kite'),
        }));

        setActiveAlerts(demoAlerts);
      } catch {
        // ignore
      }
    };

    checkAlerts();
  }, [isPt]);

  if (!mounted || dismissed || !activeAlerts.length) return null;

  return (
    <div className="glass-card p-4 border-l-4 border-l-score-fair bg-score-fair/5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-score-fair/10">
            <Bell className="w-5 h-5 text-score-fair fill-current" />
          </div>
          <div>
            <h4 className="font-bold text-fg">
              {isPt ? '🔔 Alertas Ativos' : '🔔 Active Alerts'}
            </h4>
            <div className="space-y-1 mt-1">
              {activeAlerts.map((alert, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-fg-muted">{alert.spotName}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    alert.score >= 80 ? 'bg-windDir-offshore/20 text-windDir-offshore' : 'bg-score-fair/20 text-score-fair'
                  }`}>
                    {alert.score}/100
                  </span>
                  <span className="text-fg-muted">{alert.reason}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <button 
          onClick={() => setDismissed(true)}
          className="text-fg-subtle hover:text-fg-muted transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
