import { cn } from '@/lib/cn';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      {icon && (
        <div className="w-16 h-16 rounded-card bg-surface-1/[0.04] border border-divider flex items-center justify-center mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-h3 text-fg mb-2">{title}</h3>
      {description && <p className="text-body text-fg-muted mb-4 max-w-md">{description}</p>}
      {action}
    </div>
  );
}
