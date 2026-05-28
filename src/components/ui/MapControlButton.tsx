'use client';

import { cn } from '@/lib/cn';

type MapControlButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  pressed?: boolean;
};

/**
 * Icon control for map chrome (44px touch target, design-system surfaces).
 */
export default function MapControlButton({
  children,
  onClick,
  active = false,
  pressed,
  disabled,
  className,
  type = 'button',
  ...rest
}: MapControlButtonProps) {
  const isOn = pressed ?? active;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center min-h-[44px] min-w-[44px] rounded-input border transition-colors duration-150',
        isOn
          ? 'border-divider-strong bg-surface-2/[0.08] text-fg'
          : 'border-divider bg-surface-1/[0.04] text-fg-muted hover:bg-surface-2/[0.08] hover:text-fg',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
