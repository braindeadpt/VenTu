import { cn } from '@/lib/cn';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  align?: 'left' | 'center';
  className?: string;
}

export default function PageHeader({
  title,
  subtitle,
  icon,
  align = 'left',
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'space-y-2',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {icon && <div className={cn(align === 'center' && 'flex justify-center')}>{icon}</div>}
      <h1 className="text-display-lg text-fg">{title}</h1>
      {subtitle && <p className="text-fg-muted">{subtitle}</p>}
    </div>
  );
}
