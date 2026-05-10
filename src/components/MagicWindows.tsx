'use client';

import { useMemo } from 'react';
import { Clock, Wind, Waves, Sparkles } from 'lucide-react';

interface HourlyCondition {
  time: string;
  waveHeight: number;
  wavePeriod: number;
  windSpeed: number;
  windDirection: number;
  windGust: number;
  waterTemp: number;
}

interface MagicWindow {
  start: number;
  end: number;
  duration: number;
  score: number;
  reason: string;
  reasonEn: string;
}

interface MagicWindowsProps {
  hourly: HourlyCondition[];
  spotType: string;
  spotBestWind: string;
  locale: string;
}

export default function MagicWindows({ hourly, spotType, spotBestWind, locale }: MagicWindowsProps) {
  const isPt = locale === 'pt';

  const windows = useMemo(() => {
    if (!hourly?.length) return [];

    // Parse best wind directions
    const bestWindDirs = spotBestWind.split(',').map(s => {
      const dir = s.trim();
      const map: Record<string, number> = {
        'N': 0, 'NNE': 22.5, 'NE': 45, 'ENE': 67.5,
        'E': 90, 'ESE': 112.5, 'SE': 135, 'SSE': 157.5,
        'S': 180, 'SSW': 202.5, 'SW': 225, 'WSW': 247.5,
        'W': 270, 'WNW': 292.5, 'NW': 315, 'NNW': 337.5,
        'Vário': -1, 'Variável': -1,
      };
      return map[dir] ?? -1;
    }).filter(d => d >= 0);

    const scored = hourly.map((h, i) => {
      let score = 0;
      const reasons: string[] = [];
      const reasonsEn: string[] = [];

      // Wave score
      if (spotType === 'surf' || spotType === 'big-wave') {
        if (h.waveHeight >= 1.0 && h.waveHeight <= 2.5) {
          score += 25;
          reasons.push('Ondas boas');
          reasonsEn.push('Good waves');
        } else if (h.waveHeight > 2.5) {
          score += 20;
          reasons.push('Ondas grandes');
          reasonsEn.push('Big waves');
        }
        if (h.wavePeriod >= 10) {
          score += 15;
          reasons.push('Período longo');
          reasonsEn.push('Long period');
        }
      }

      if (spotType === 'kitesurf') {
        const windKnots = h.windSpeed * 1.94384;
        if (windKnots >= 15 && windKnots <= 28) {
          score += 30;
          reasons.push(`Vento ideal (${Math.round(windKnots)}kt)`);
          reasonsEn.push(`Ideal wind (${Math.round(windKnots)}kt)`);
        }
      }

      if (spotType === 'windsurf') {
        const windKnots = h.windSpeed * 1.94384;
        if (windKnots >= 12 && windKnots <= 25) {
          score += 30;
          reasons.push(`Vento bom (${Math.round(windKnots)}kt)`);
          reasonsEn.push(`Good wind (${Math.round(windKnots)}kt)`);
        }
      }

      // Wind direction score (offshore = best)
      const windDir = h.windDirection;
      const isOffshore = bestWindDirs.some(d => {
        const diff = Math.abs(windDir - d);
        return diff <= 45 || diff >= 315;
      });
      
      if (isOffshore) {
        score += 25;
        reasons.push('Vento offshore');
        reasonsEn.push('Offshore wind');
      } else if (h.windSpeed < 5) {
        score += 15;
        reasons.push('Vento fraco');
        reasonsEn.push('Light wind');
      }

      return {
        hour: i,
        time: h.time,
        score,
        reasons,
        reasonsEn,
      };
    });

    // Find consecutive windows with score > 50
    const windows: MagicWindow[] = [];
    let start = -1;
    let end = -1;

    for (let i = 0; i < scored.length; i++) {
      if (scored[i].score >= 50) {
        if (start === -1) start = i;
        end = i;
      } else {
        if (start !== -1 && end - start >= 1) {
          const windowScores = scored.slice(start, end + 1);
          const avgScore = Math.round(windowScores.reduce((a, b) => a + b.score, 0) / windowScores.length);
          const allReasons = Array.from(new Set(windowScores.flatMap(s => s.reasons)));
          const allReasonsEn = Array.from(new Set(windowScores.flatMap(s => s.reasonsEn)));

          windows.push({
            start,
            end,
            duration: end - start + 1,
            score: avgScore,
            reason: allReasons.slice(0, 3).join(' + '),
            reasonEn: allReasonsEn.slice(0, 3).join(' + '),
          });
        }
        start = -1;
        end = -1;
      }
    }

    // Handle trailing window
    if (start !== -1 && end - start >= 1) {
      const windowScores = scored.slice(start, end + 1);
      const avgScore = Math.round(windowScores.reduce((a, b) => a + b.score, 0) / windowScores.length);
      const allReasons = Array.from(new Set(windowScores.flatMap(s => s.reasons)));
      const allReasonsEn = Array.from(new Set(windowScores.flatMap(s => s.reasonsEn)));

      windows.push({
        start,
        end,
        duration: end - start + 1,
        score: avgScore,
        reason: allReasons.slice(0, 3).join(' + '),
        reasonEn: allReasonsEn.slice(0, 3).join(' + '),
      });
    }

    return windows.sort((a, b) => b.score - a.score).slice(0, 3);
  }, [hourly, spotType, spotBestWind]);

  if (!windows.length) {
    return (
      <div className="glass-card p-4 text-center text-white/50 text-sm">
        {isPt ? 'Nenhuma janela mágica detectada nas próximas horas.' : 'No magic windows detected in the next hours.'}
      </div>
    );
  }

  const formatHour = (idx: number) => {
    const h = hourly[idx];
    if (!h?.time) return '--:--';
    const date = new Date(h.time);
    return date.toLocaleTimeString(isPt ? 'pt-PT' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-yellow-400" />
        <h3 className="text-lg font-bold text-white/90">
          {isPt ? '✨ Janelas Mágicas' : '✨ Magic Windows'}
        </h3>
      </div>

      {windows.map((w, i) => (
        <div
          key={i}
          className={`glass-card p-4 border-l-4 ${
            w.score >= 80 ? 'border-l-green-400' : w.score >= 60 ? 'border-l-yellow-400' : 'border-l-cyan-400'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Clock className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <div className="font-bold text-white">
                  {formatHour(w.start)} — {formatHour(w.end)}
                </div>
                <div className="text-xs text-white/50">
                  {isPt ? `${w.duration}h de condições boas` : `${w.duration}h of good conditions`}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-bold ${
                w.score >= 80 ? 'text-green-400' : w.score >= 60 ? 'text-yellow-400' : 'text-cyan-400'
              }`}>
                {w.score}
              </div>
              <div className="text-xs text-white/50">/100</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            {(isPt ? w.reason : w.reasonEn).split(' + ').map((r, ri) => (
              <span
                key={ri}
                className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-white/60 border border-white/10"
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
