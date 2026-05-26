import { AlertCircle } from 'lucide-react';
import { getTranslation } from '@/lib/i18n';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/cn';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  locale?: string;
  className?: string;
}

export default function ErrorState({
  message,
  onRetry,
  locale = 'pt',
  className,
}: ErrorStateProps) {
  const t = getTranslation(locale as 'pt' | 'en');
  const isPt = locale === 'pt';

  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto', className)}>
      <div className="w-16 h-16 rounded-card bg-score-poor/10 border border-score-poor/25 flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-score-poor" aria-hidden />
      </div>
      <h3 className="text-h3 text-fg mb-2">{message ?? t.common.error}</h3>
      <p className="text-body text-fg-muted mb-6">
        {isPt
          ? 'Verifica a ligação à internet e tenta novamente.'
          : 'Check your internet connection and try again.'}
      </p>
      {onRetry && (
        <Button onClick={onRetry}>{t.common.refresh}</Button>
      )}
    </div>
  );
}
