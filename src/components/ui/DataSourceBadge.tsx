import { getDataFreshness, formatStaleAge } from '@/lib/dataFreshness';

interface DataSourceBadgeProps {
  source?: 'real' | 'mock';
  updatedAt?: string | null;
  locale?: string;
  size?: 'sm' | 'md';
  className?: string;
}

const sizeClasses = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-1 text-xs',
};

export default function DataSourceBadge({
  source,
  updatedAt,
  locale = 'pt',
  size = 'sm',
  className = '',
}: DataSourceBadgeProps) {
  const isPt = locale === 'pt';

  if (source === 'mock') {
    return (
      <span
        className={`inline-flex items-center rounded font-bold bg-score-fair/20 text-score-fair border border-score-fair/30 ${sizeClasses[size]} ${className}`}
        title={isPt ? 'Dados estimados — API indisponível' : 'Estimated data — API unavailable'}
      >
        DEMO
      </span>
    );
  }

  const freshness = getDataFreshness(updatedAt);
  if (!freshness || freshness === 'fresh') return null;

  const isVeryStale = freshness === 'very-stale';
  const label = updatedAt
    ? formatStaleAge(updatedAt, isPt)
    : isPt ? 'Desactualizado' : 'Outdated';

  return (
    <span
      className={`inline-flex items-center rounded font-medium border ${sizeClasses[size]} ${
        isVeryStale
          ? 'bg-score-poor/20 text-score-poor border-score-poor/30'
          : 'bg-score-fair/20 text-score-fair border-score-fair/30'
      } ${className}`}
      title={
        isPt
          ? 'Condições actualizadas a cada 3 horas via Open-Meteo'
          : 'Conditions updated every 3 hours via Open-Meteo'
      }
    >
      {label}
    </span>
  );
}
