import { type ReactNode } from 'react';
import { Info, AlertTriangle, ShieldAlert, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type AlertSeverity = 'info' | 'warning' | 'danger';

interface AlertChipProps {
  /** Severity drives the colour and icon. */
  severity: AlertSeverity;
  /** Short title (1 line). */
  title: string;
  /** Optional longer description, supports text + inline nodes. */
  description?: ReactNode;
  /** Optional icon override. If omitted, a default per severity is used. */
  icon?: ReactNode;
  /** Action slot (button, link). */
  action?: ReactNode;
  /** Optional dismiss button. */
  onDismiss?: () => void;
  className?: string;
}

const SEVERITY_STYLES: Record<AlertSeverity, {
  bg: string;
  border: string;
  text: string;
  icon: string;
  iconClass: string;
}> = {
  info: {
    bg: 'bg-data-waves/10',
    border: 'border-data-waves/25',
    text: 'text-data-waves',
    icon: 'border-data-waves/30',
    iconClass: 'text-data-waves',
  },
  warning: {
    bg: 'bg-score-fair/12',
    border: 'border-score-fair/30',
    text: 'text-score-fair',
    icon: 'border-score-fair/35',
    iconClass: 'text-score-fair',
  },
  danger: {
    bg: 'bg-score-poor/12',
    border: 'border-score-poor/35',
    text: 'text-score-poor',
    icon: 'border-score-poor/40',
    iconClass: 'text-score-poor',
  },
};

type IconComponent = (props: { className?: string; 'aria-hidden'?: boolean }) => ReactNode;

const SEVERITY_DEFAULT_ICON: Record<AlertSeverity, IconComponent> = {
  info: (p) => <Info className={p.className} aria-hidden />,
  warning: (p) => <AlertTriangle className={p.className} aria-hidden />,
  danger: (p) => <ShieldAlert className={p.className} aria-hidden />,
};

const ROLE: Record<AlertSeverity, 'status' | 'alert'> = {
  info: 'status',
  warning: 'alert',
  danger: 'alert',
};

/**
 * AlertChip — instrument-grade inline notice with a 3-tier severity scale.
 * No pink / no warm gradients; uses the score palette (data-waves / fair / poor)
 * so the chip reads as part of the data, not a UI decoration.
 */
export default function AlertChip({
  severity,
  title,
  description,
  icon,
  action,
  onDismiss,
  className,
}: AlertChipProps) {
  const s = SEVERITY_STYLES[severity];
  const DefaultIcon = SEVERITY_DEFAULT_ICON[severity];
  const IconEl = icon ?? DefaultIcon({ className: cn('w-4 h-4', s.iconClass) });

  return (
    <div
      role={ROLE[severity]}
      className={cn(
        'flex items-start gap-2.5 sm:gap-3 px-3 py-2.5 rounded-input',
        'border',
        s.bg,
        s.border,
        className,
      )}
    >
      <div
        className={cn(
          'shrink-0 flex items-center justify-center w-7 h-7 rounded-pill border',
          s.icon,
        )}
        aria-hidden
      >
        {IconEl}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-body-sm font-semibold leading-snug', s.text)}>
          {title}
        </p>
        {description && (
          <p className="text-meta-sm text-fg-muted mt-0.5 leading-relaxed">{description}</p>
        )}
        {action && <div className="mt-1.5">{action}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 -m-1 p-1 text-fg-muted hover:text-fg rounded transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
