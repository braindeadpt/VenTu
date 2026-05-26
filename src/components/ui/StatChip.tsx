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
        'inline-flex items-center gap-2 rounded-pill bg-surface-1 border border-divider px-3 py-2 min-h-[44px]',
        className,
      )}
    >
      <span className="text-fg-muted shrink-0" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="font-mono text-num-sm text-fg tabular-nums leading-none">{value}</div>
        <div className="text-meta-sm text-fg-muted mt-0.5">{label}</div>
      </div>
    </div>
  );
}
