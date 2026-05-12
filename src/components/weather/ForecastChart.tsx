'use client';

import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface ForecastChartProps {
  data: Array<{
    time: string;
    waveHeight: number;
    windSpeed: number;
    windGust: number;
    waterTemp: number;
  }>;
  locale?: string;
}

export default function ForecastChart({ data, locale = 'pt' }: ForecastChartProps) {
  const isPt = locale === 'pt';
  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      time: new Date(d.time).toLocaleDateString(isPt ? 'pt-PT' : 'en-GB', { weekday: 'short', hour: '2-digit' }),
    }));
  }, [data, isPt]);

  return (
    <div className="glass-card p-4">
      <h3 className="text-lg font-semibold mb-4 text-fg">{isPt ? 'Previsão 7 Dias' : '7 Day Forecast'}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="waveGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="rgb(var(--data-waves))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="rgb(var(--data-waves))" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="windGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="rgb(var(--data-wind))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="rgb(var(--data-wind))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--divider))" />
          <XAxis dataKey="time" stroke="rgb(var(--fg-subtle))" tick={{ fill: 'rgb(var(--fg-muted))', fontSize: 12 }} />
          <YAxis stroke="rgb(var(--fg-subtle))" tick={{ fill: 'rgb(var(--fg-muted))', fontSize: 12 }} />
          <Tooltip contentStyle={{ backgroundColor: 'rgb(var(--bg-elevated))', border: '1px solid rgb(var(--divider))', borderRadius: '8px', color: 'rgb(var(--fg))' }} />
          <Legend wrapperStyle={{ color: 'rgb(var(--fg-muted))' }} />
          <Area type="monotone" dataKey="waveHeight" name={isPt ? "Ondas (m)" : "Waves (m)"} stroke="rgb(var(--data-waves))" fill="url(#waveGradient)" strokeWidth={2} />
          <Area type="monotone" dataKey="windSpeed" name={isPt ? "Vento (kt)" : "Wind (kt)"} stroke="rgb(var(--data-wind))" fill="url(#windGradient)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}