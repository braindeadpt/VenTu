interface MetricBarProps {
  label: string;
  value: string | number;
  unit: string;
  fillPercent: number;
  colorVar?: string;
}

export default function MetricBar({
  label,
  value,
  unit,
  fillPercent,
  colorVar = '--data-waves',
}: MetricBarProps) {
  const clamped = Math.min(100, Math.max(0, fillPercent));

  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-24 shrink-0 text-xs text-fg-muted">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-surface-1 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 motion-reduce:transition-none"
          style={{ width: `${clamped}%`, backgroundColor: `rgb(var(${colorVar}) / 0.7)` }}
        />
      </div>
      <span className="w-16 text-right text-xs font-semibold text-fg tabular-nums shrink-0">
        {value}
        <span className="text-fg-subtle font-normal ml-0.5">{unit}</span>
      </span>
    </div>
  );
}
