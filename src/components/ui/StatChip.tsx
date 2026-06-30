import { cn } from '@/lib/cn';

interface StatChipProps {
  icon: React.ReactNode;
  value: string;
  label: string;
  className?: string;
}

export default function StatChip({ icon, value, label, className }: StatChipProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-card border border-divider bg-surface-1/[0.04] px-2.5 py-2',
        className,
      )}
    >
      <span className="shrink-0 text-fg-subtle" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-mono text-num-sm text-fg tabular-nums leading-tight">{value}</p>
        <p className="text-meta-sm text-fg-subtle leading-tight">{label}</p>
      </div>
    </div>
  );
}
