import { getTranslation } from '@/lib/i18n';

interface HomepageGridStatusBarProps {
  locale: string;
  maxTs: number | null;
  spotCount: number;
}

export default function HomepageGridStatusBar({
  locale,
  maxTs,
  spotCount,
}: HomepageGridStatusBarProps) {
  const t = getTranslation(locale as 'pt' | 'en');
  const isPt = locale === 'pt';

  const updatedLabel = maxTs
    ? t.hero.statusUpdated.replace(
        '{time}',
        new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
          new Date(maxTs),
        ),
      )
    : t.hero.statusNoData;

  return (
    <section
      role="status"
      aria-live="polite"
      className="border-y border-divider bg-surface-1"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-10 flex items-center">
        <p className="text-meta-sm text-fg-muted truncate w-full">
          <span>{updatedLabel}</span>
          <span aria-hidden className="mx-2">
            ·
          </span>
          <span>{t.hero.gridStatusSource}</span>
          <span aria-hidden className="mx-2">
            ·
          </span>
          <span>
            <span className="font-mono tabular-nums text-fg">{spotCount}</span>{' '}
            {isPt ? t.hero.spotsCount : t.hero.spotsCount}
          </span>
        </p>
      </div>
    </section>
  );
}
