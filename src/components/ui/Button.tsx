'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-bg-base hover:bg-accent-hover active:bg-accent-active border border-transparent',
  secondary:
    'bg-surface-1/[0.04] text-fg border border-divider hover:bg-surface-2/[0.08] hover:border-divider-strong active:bg-surface-1/[0.04]',
  ghost:
    'bg-transparent text-fg-muted hover:text-fg hover:bg-surface-1/[0.04] border border-transparent active:bg-surface-2/[0.08]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-input min-h-[36px]',
  md: 'px-4 py-2 text-sm rounded-input min-h-[44px]',
  lg: 'px-6 py-3 text-base rounded-input min-h-[48px]',
};

type ButtonBaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  locale?: 'pt' | 'en' | 'es' | 'de' | 'fr';
};

type ButtonAsButton = ButtonBaseProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

type ButtonAsLink = ButtonBaseProps &
  Omit<React.ComponentProps<typeof Link>, 'className' | 'children'> & { href: string };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  loading,
  loadingLabel,
  leftIcon,
  rightIcon,
  locale = 'pt',
  ...props
}: ButtonProps) {
  const defaultLoadingLabel = locale === 'pt' ? 'A carregar…' : 'Loading…';
  const label = loadingLabel ?? defaultLoadingLabel;

  const classes = cn(
    'inline-flex items-center justify-center gap-2 font-medium',
    'transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-out',
    'disabled:opacity-40 disabled:cursor-not-allowed',
    'active:scale-[0.98]',
    variantClasses[variant],
    sizeClasses[size],
    className,
  );

  const content = loading ? (
    <>
      <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
      <span>{label}</span>
    </>
  ) : (
    <>
      {leftIcon}
      {children}
      {rightIcon}
    </>
  );

  if ('href' in props && props.href) {
    const { href, ...linkProps } = props;
    return (
      <Link href={href} className={classes} aria-busy={loading || undefined} {...linkProps}>
        {content}
      </Link>
    );
  }

  const { href: _href, ...buttonProps } = props as ButtonAsButton;
  return (
    <button
      type="button"
      className={classes}
      disabled={loading || buttonProps.disabled}
      aria-busy={loading || undefined}
      {...buttonProps}
    >
      {content}
    </button>
  );
}
