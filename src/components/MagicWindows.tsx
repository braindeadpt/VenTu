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

      // Wave score (surf/big-wave)
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

      // Wind score (kitesurf)
      if (spotType === 'kitesurf') {
        const windKnots = h.windSpeed * 1.94384;
        if (windKnots >= 15 && windKnots <= 28) {
          score += 30;
          reasons.push(`Vento ideal (${Math.round(windKnots)}kt)`);
          reasonsEn.push(`Ideal wind (${Math.round(windKnots)}kt)`);
        } else if (windKnots >= 10 && windKnots < 15) {
          score += 15;
          reasons.push(`Vento leve (${Math.round(windKnots)}kt)`);
          reasonsEn.push(`Light wind (${Math.round(windKnots)}kt)`);
        }
      }

      // Wind score (windsurf)
      if (spotType === 'windsurf') {
        const windKnots = h.windSpeed * 1.94384;
        if (windKnots >= 12 && windKnots <= 25) {
          score += 30;
          reasons.push(`Vento bom (${Math.round(windKnots)}kt)`);
          reasonsEn.push(`Good wind (${Math.round(windKnots)}kt)`);
        } else if (windKnots >= 8 && windKnots < 12) {
          score += 15;
          reasons.push(`Vento leve (${Math.round(windKnots)}kt)`);
          reasonsEn.push(`Light wind (${Math.round(windKnots)}kt)`);
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

      // Bonus: comfortable water temp
      if (h.waterTemp >= 18) {
        score += 5;
      }
      // Variety bonus: stable conditions get a small bonus
      const waveVariance = i > 0 ? Math.abs(h.waveHeight - hourly[i-1]?.waveHeight || 0) : 0;
      const windVariance = i > 0 ? Math.abs(h.windSpeed - hourly[i-1]?.windSpeed || 0) : 0;
      if (waveVariance < 0.3 && windVariance < 5) {
        score += 3;
      }
      // Morning bonus (for surf): early hours slightly preferred
      const hourOfDay = new Date(h.time).getHours();
      if ((spotType === 'surf' || spotType === 'big-wave') && hourOfDay >= 6 && hourOfDay <= 10) {
        score += 4;
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
          const avgScore = Math.floor(windowScores.reduce((a, b) => a + b.score, 0) / windowScores.length);
          // Bonus for longer windows (stability = value)
          const durationBonus = Math.min((end - start) * 2, 15); // up to +15 for 8h+ windows
          const finalScore = Math.min(avgScore + durationBonus, 100);
          const allReasons = Array.from(new Set(windowScores.flatMap(s => s.reasons)));
          const allReasonsEn = Array.from(new Set(windowScores.flatMap(s => s.reasonsEn)));

          windows.push({
            start,
            end,
            duration: end - start + 1,
            score: finalScore,
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
      const avgScore = Math.floor(windowScores.reduce((a, b) => a + b.score, 0) / windowScores.length);
      const durationBonus = Math.min((end - start) * 2, 15);
      const finalScore = Math.min(avgScore + durationBonus, 100);
      const allReasons = Array.from(new Set(windowScores.flatMap(s => s.reasons)));
      const allReasonsEn = Array.from(new Set(windowScores.flatMap(s => s.reasonsEn)));

      windows.push({
        start,
        end,
        duration: end - start + 1,
        score: finalScore,
        reason: allReasons.slice(0, 3).join(' + '),
        reasonEn: allReasonsEn.slice(0, 3).join(' + '),
      });
    }

    return windows.sort((a, b) => b.score - a.score).slice(0, 3);
  }, [hourly, spotType, spotBestWind]);

  if (!windows.length) {
    return (
      <div className="glass-card p-4 text-center text-fg-muted text-sm">
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
        <Sparkles className="w-5 h-5 text-score-fair" />
        <h3 className="text-lg font-bold text-fg">
          {isPt ? '✨ Janelas Mágicas' : '✨ Magic Windows'}
        </h3>
      </div>

      {windows.map((w, i) => (
        <div
          key={i}
          className={`glass-card p-4 border-l-4 ${
            w.score >= 80 ? 'border-l-windDir-offshore' : w.score >= 60 ? 'border-l-score-fair' : 'border-l-data-waves'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-score-fair/10">
                <Clock className="w-5 h-5 text-score-fair" />
              </div>
              <div>
                <div className="font-bold text-fg">
                  {formatHour(w.start)} — {formatHour(w.end)}
                </div>
                <div className="text-xs text-fg-muted">
                  {isPt ? `${w.duration}h de condições boas` : `${w.duration}h of good conditions`}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-bold ${
                w.score >= 80 ? 'text-windDir-offshore' : w.score >= 60 ? 'text-score-fair' : 'text-data-waves'
              }`}>
                {w.score}
              </div>
              <div className="text-xs text-fg-muted">/100</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            {(isPt ? w.reason : w.reasonEn).split(' + ').map((r, ri) => (
              <span
                key={ri}
                className="text-xs px-2.5 py-1 rounded-full bg-surface-1 text-fg-muted border border-divider"
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
