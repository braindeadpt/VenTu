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
      windSpeed: Math.round(d.windSpeed * 1.94384),
      windGust: Math.round(d.windGust * 1.94384),
      time: new Date(d.time).toLocaleDateString(isPt ? 'pt-PT' : 'en-GB', { weekday: 'short', hour: '2-digit' }),
    }));
  }, [data, isPt]);

  return (
    <div className="glass-card p-4">
      <h3 className="text-lg font-semibold mb-4 text-white/90">{isPt ? 'Previsão 7 Dias' : '7 Day Forecast'}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="waveGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="windGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} />
          <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} />
          <Tooltip contentStyle={{ backgroundColor: 'rgba(8, 47, 73, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
          <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.7)' }} />
          <Area type="monotone" dataKey="waveHeight" name={isPt ? "Ondas (m)" : "Waves (m)"} stroke="#3b82f6" fill="url(#waveGradient)" strokeWidth={2} />
          <Area type="monotone" dataKey="windSpeed" name={isPt ? "Vento (kt)" : "Wind (kt)"} stroke="#f59e0b" fill="url(#windGradient)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}