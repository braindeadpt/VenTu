import { AlertTriangle } from 'lucide-react';
import { getTranslation } from '@/lib/i18n';
import type { WindSafetyLevel } from '@/lib/sportScore';
import { cn } from '@/lib/cn';

type WindSafetyNoteVariant = 'default' | 'compact' | 'popup';

/** `so-profissionais`: vento forte no kite (≥ 30 kt médios), só para profissionais. */
export type WindSafetyNoteLevel = WindSafetyLevel | 'so-profissionais';

interface WindSafetyNoteProps {
  level: WindSafetyNoteLevel;
  locale: string;
  variant?: WindSafetyNoteVariant;
  className?: string;
}

const LEVEL_CLASS: Record<WindSafetyNoteLevel, string> = {
  'side-offshore': 'bg-score-fair/15 text-score-fair border-score-fair/40',
  offshore: 'bg-score-poor/15 text-score-poor border-score-poor/40',
  'so-profissionais': 'bg-score-poor/15 text-score-poor border-score-poor/40',
};

const VARIANT_CLASS: Record<WindSafetyNoteVariant, string> = {
  default: 'px-2.5 py-1.5 text-meta-sm',
  compact: 'px-2 py-1 text-meta-sm',
  popup: 'px-2 py-1 text-[11px]',
};

/**
 * Aviso visível (texto, não tooltip) da componente offshore do vento nos
 * desportos de vento — a mesma nota no veredicto, nos cartões e no mapa.
 * Também o aviso «Só profissionais» do vento forte no kite (mesmo estilo do offshore).
 * Sem hooks: também é usada no HTML estático do popup Leaflet.
 */
export default function WindSafetyNote({
  level,
  locale,
  variant = 'default',
  className,
}: WindSafetyNoteProps) {
  const t = getTranslation(locale).windSafety;
  const text = level === 'offshore' ? t.offshore : level === 'so-profissionais' ? t.soProfissionais : t.sideOffshore;
  return (
    <p
      role="note"
      data-wind-safety={level}
      className={cn(
        'inline-flex items-start gap-1.5 rounded-input border font-semibold leading-snug',
        LEVEL_CLASS[level],
        VARIANT_CLASS[variant],
        className,
      )}
    >
      <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden />
      <span>{text}</span>
    </p>
  );
}
