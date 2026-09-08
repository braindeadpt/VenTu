import { getScoreTokens } from '@/lib/sportScore';
import type { BestWindowToday } from '@/lib/bestWindowToday';
import { formatBestWindowHours } from '@/lib/bestWindow';
import { pickLocale, validateLocale } from '@/lib/i18n';
import Link from 'next/link';

interface BestWindowBannerProps {
  window: BestWindowToday & { tier?: ReturnType<typeof getScoreTokens>['tier'] };
  spotSlug: string;
  spotName: string;
  locale: string;
  /** Score we should display (can be the peak of the window, or the current). */
  displayScore?: number;
}

/**
 * "Onde está bom hoje?" — Best-window strip with the top spot, score and
 * time-of-day window. Sits inside the hero overlay (sibling of the heading).
 */
export default function BestWindowBanner({
  window,
  spotSlug,
  spotName,
  locale,
  displayScore,
}: BestWindowBannerProps) {
  const loc = validateLocale(locale);
  const score = displayScore ?? window.score;
  const tokens = getScoreTokens(score);
  const tier = window.tier ?? tokens.tier;
  const tierLabel = pickLocale(loc, {
    pt: { epic: 'Épico', good: 'Bom', fair: 'Médio', poor: 'Fraco', closed: 'Sem janela' }[tier],
    en: { epic: 'Epic', good: 'Good', fair: 'Fair', poor: 'Poor', closed: 'No window' }[tier],
    es: { epic: 'Épico', good: 'Bueno', fair: 'Regular', poor: 'Flojo', closed: 'Sin ventana' }[tier],
    de: { epic: 'Episch', good: 'Gut', fair: 'Mäßig', poor: 'Schwach', closed: 'Kein Fenster' }[tier],
    fr: { epic: 'Épique', good: 'Bon', fair: 'Moyen', poor: 'Faible', closed: 'Pas de fenêtre' }[tier],
  });
  const hours = formatBestWindowHours(window);
  const atWord = pickLocale(loc, {
    pt: 'em',
    en: 'at',
    es: 'en',
    de: 'in',
    fr: 'à',
  });
  const rounded = Math.round(score);
  // Single plain-text-friendly label — score/tier/hours live in separate
  // visual nodes with CSS gap; without a combined string, textContent becomes
  // "73Bom23h–19hemVieira".
  const combined = `${rounded} ${tierLabel} ${hours} ${atWord} ${spotName}`;
  const ariaLabel = pickLocale(loc, {
    pt: `Melhor janela hoje: ${tierLabel} ${hours} em ${spotName}, score ${rounded}`,
    en: `Best window today: ${tierLabel} ${hours} at ${spotName}, score ${rounded}`,
    es: `Mejor ventana hoy: ${tierLabel} ${hours} en ${spotName}, score ${rounded}`,
    de: `Bestes Fenster heute: ${tierLabel} ${hours} in ${spotName}, Score ${rounded}`,
    fr: `Meilleure fenêtre aujourd'hui : ${tierLabel} ${hours} à ${spotName}, score ${rounded}`,
  });

  return (
    <Link
      href={`/${locale}/spots/${spotSlug}/`}
      className="group inline-flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-2 sm:py-2.5 rounded-pill bg-bg-base/55 backdrop-blur-md border border-divider hover:border-divider-strong transition-colors duration-base ease-out max-w-full"
      aria-label={ariaLabel}
    >
      <span className="sr-only">{combined}</span>
      <span
        aria-hidden
        className={[
          'inline-flex items-center justify-center min-w-[44px] sm:min-w-[52px] h-7 sm:h-8 rounded-pill font-mono font-semibold text-sm sm:text-base px-2',
          tokens.bg,
          tokens.text,
          tokens.border,
          'border',
        ].join(' ')}
      >
        {rounded}
      </span>
      {/* span not div — keeps flow content valid inside <Link>/<a> for hydration */}
      <span aria-hidden className="inline-flex flex-col min-w-0">
        <span className="text-body-sm font-semibold text-fg truncate">
          {tierLabel} {hours}
        </span>
        <span className="text-meta text-fg-muted truncate font-mono tabular-nums">
          {atWord} {spotName}
        </span>
      </span>
    </Link>
  );
}
