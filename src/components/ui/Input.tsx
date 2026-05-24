'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  wrapperClassName?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, icon, wrapperClassName, ...props },
  ref,
) {
  const inputClasses = cn(
    'w-full rounded-card border border-divider bg-surface-1 text-sm text-fg',
    'placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-data-waves/30',
    icon ? 'pl-9 pr-3 py-2.5' : 'px-3 py-2.5',
    className,
  );

  if (icon) {
    return (
      <div className={cn('relative', wrapperClassName)}>
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none" aria-hidden>
          {icon}
        </div>
        <input ref={ref} className={inputClasses} {...props} />
      </div>
    );
  }

  return <input ref={ref} className={inputClasses} {...props} />;
});

export default Input;
