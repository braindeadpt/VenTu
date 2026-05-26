import { cn } from '@/lib/cn';

type CardVariant = 'card-1' | 'card-2' | 'card-hero';

interface CardProps {
  variant?: CardVariant;
  padding?: boolean;
  className?: string;
  children: React.ReactNode;
  as?: 'div' | 'section' | 'article' | 'li' | 'button' | 'a';
  onClick?: () => void;
  hoverable?: boolean;
  href?: string;
}

const hoverClasses =
  'transition-[transform,box-shadow,border-color,background-color] duration-150 ease-out hover:-translate-y-px hover:shadow-card-hover hover:border-divider-strong active:translate-y-0 active:shadow-card';

export default function Card({
  variant = 'card-1',
  padding = true,
  className,
  children,
  as: Tag = 'div',
  onClick,
  hoverable,
  href,
}: CardProps) {
  const isClickable = Boolean(onClick || hoverable || href);
  const classes = cn(
    variant,
    padding && 'p-4',
    isClickable && 'cursor-pointer',
    isClickable && hoverClasses,
    className,
  );

  if (href) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <Tag
      className={classes}
      onClick={onClick}
      role={onClick && Tag === 'div' ? 'button' : undefined}
      tabIndex={onClick && Tag === 'div' ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {children}
    </Tag>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  className?: string;
}

export function StatCard({ label, value, className }: StatCardProps) {
  return (
    <Card variant="card-1" hoverable className={cn('text-center', className)}>
      <dd className="font-mono text-num-lg text-fg tabular-nums">{value}</dd>
      <dt className="text-meta-sm text-fg-subtle mt-1">{label}</dt>
    </Card>
  );
}
