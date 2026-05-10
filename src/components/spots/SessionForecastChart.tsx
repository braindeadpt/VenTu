'use client';

import { useMemo } from 'react';
import { Clock } from 'lucide-react';

interface HourlyForecast {
  time: string;
  waveHeight: number;
  wavePeriod: number;
  windSpeed: number;
  windDirection: number;
  score: number;
  rating: string;
}

interface SessionForecastChartProps {
  forecast: HourlyForecast[];
  locale: string;
}

export function SessionForecastChart({ forecast, locale }: SessionForecastChartProps) {
  const isPT = locale === 'pt';

  const maxScore = useMemo(() => Math.max(...forecast.map(f => f.score), 1), [forecast]);

  const getBarColor = (score: number) => {
    if (score >= 90) return 'bg-gradient-to-r from-amber-400 to-red-500'; // FIRE!/ÉPICO! glow
    if (score >= 80) return 'bg-emerald-400';
    if (score >= 60) return 'bg-cyan-400';
    if (score >= 40) return 'bg-yellow-400';
    if (score >= 20) return 'bg-orange-400';
    return 'bg-red-400';
  };

  const getRatingLabel = (rating: string) => {
    if (isPT) return rating;
    const map: Record<string, string> = {
      'FIRE!': 'FIRE!',
      'ÉPICO!': 'EPIC!',
      'BOM!': 'GOOD!',
      'Ótimo': 'Great',
      'Bom': 'Good',
      'Razoável': 'Fair',
      'Fraco': 'Weak',
      'Mau': 'Poor',
      'Não Vale a Pena': 'Not Worth It',
    };
    return map[rating] || rating;
  };

  const formatHour = (timeStr: string) => {
    const date = new Date(timeStr);
    return date.toLocaleTimeString(isPT ? 'pt-PT' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className="bg-slate-800/60 backdrop-blur-sm rounded-xl p-5 border border-cyan-500/20">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-cyan-400" />
        <h3 className="text-lg font-bold text-white">
          {isPT ? '📊 Session Quality — Próximas 12h' : '📊 Session Quality — Next 12h'}
        </h3>
      </div>

      <div className="space-y-2.5">
        {forecast.map((hour, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-slate-400 w-12 shrink-0 text-right">
              {formatHour(hour.time)}
            </span>

            <div className="flex-1 relative h-7 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className={`absolute left-0 top-0 h-full rounded-full transition-all ${getBarColor(hour.score)}`}
                style={{ width: `${(hour.score / maxScore) * 100}%` }}
              />
              <span className="absolute inset-0 flex items-center px-2 text-xs font-bold text-white z-10">
                {hour.score}/100
              </span>
            </div>

            <span className="text-xs font-semibold w-16 text-right shrink-0" style={{
              color: hour.score >= 90 ? '#f59e0b' : hour.score >= 80 ? '#34d399' : hour.score >= 60 ? '#22d3ee' : hour.score >= 40 ? '#facc15' : hour.score >= 20 ? '#fb923c' : '#f87171'
            }}>
              {getRatingLabel(hour.rating)}
            </span>

            <span className="text-xs text-slate-500 w-20 shrink-0 hidden sm:block">
              {hour.waveHeight.toFixed(1)}m · {hour.windSpeed.toFixed(0)}kt
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {isPT
          ? '💡 Dica: Horas com score ≥ 80 são ideais para surf. Score ≥ 60 é bom.'
          : '💡 Tip: Hours with score ≥ 80 are ideal for surfing. Score ≥ 60 is good.'}
      </p>
    </div>
  );
}
