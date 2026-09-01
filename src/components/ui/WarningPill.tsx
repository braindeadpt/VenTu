'use client';

import { AlertTriangle, Waves } from 'lucide-react';
import { warningLevelLabel, WARNING_LEVEL_META } from '@/lib/ipmaWarnings';
import type { IpmaWarningLevel } from '@/lib/ipmaWarnings';

/**
 * Normalized warning shape accepted by WarningPill. Both raw IPMA warnings
 * (IpmaWarning) and the map's MapMarkerWarning satisfy it — pass what you
 * have; the pill only needs level + a localized label.
 */
export interface WarningPillData {
  level: IpmaWarningLevel;
  /** Label already localized (warningBadgeLabel) — «Mar perigoso» / «Vento». */
  label: string;
  /** Sea-state (Agitação Marítima) → Waves icon + direct label. */
  seaState?: boolean;
  /** Warning area (e.g. «Lisboa») — tooltip only, no visual space. */
  areaLabel?: string;
  /** Raw warning type (e.g. «Agitação Marítima») — tooltip level label. */
  type?: string;
}

/** Surface-appropriate sizing — the sticky bar and popup are intentionally smaller. */
export type WarningPillVariant = 'default' | 'compact' | 'mini' | 'popup';

interface WarningPillProps {
  warning: WarningPillData;
  locale: string;
  variant?: WarningPillVariant;
  /** data-map-warning value (e2e hooks); omitted = no attribute. */
  dataAttr?: string;
  /** Append the localized level — e.g. «Mar perigoso (Laranja)» (map popup). */
  showLevel?: boolean;
  className?: string;
}

const VARIANT_CLASS: Record<WarningPillVariant, string> = {
  default: 'px-2.5 py-1.5 text-meta-sm font-semibold',
  compact: 'shrink-0 px-2 py-1 font-medium whitespace-nowrap text-meta-sm',
  mini: 'shrink-0 px-2 py-0.5 min-h-0 text-meta-sm',
  popup: 'px-2 py-1 text-[11px] font-semibold',
};

const ICON_CLASS: Record<WarningPillVariant, string> = {
  default: 'w-3.5 h-3.5',
  compact: 'w-3.5 h-3.5',
  mini: 'w-3 h-3',
  popup: 'w-3 h-3',
};

/** Single source for the chip tooltip — «Aviso IPMA: Mar perigoso (Laranja) · Lisboa». */
export function warningPillTitle(warning: WarningPillData, locale: string): string {
  const isPt = locale === 'pt';
  const base = isPt ? 'Aviso IPMA' : 'IPMA warning';
  const core = `${base}: ${warning.label} (${warningLevelLabel(warning.level, locale)})`;
  return warning.areaLabel ? `${core} · ${warning.areaLabel}` : core;
}

/**
 * The one warning chip on every surface (observed-wave card, sticky bar,
 * map popup/sheet, spot preview, home cards). Label, icon and level colors
 * come from a single place so surfaces never diverge.
 */
export default function WarningPill({
  warning,
  locale,
  variant = 'default',
  dataAttr,
  showLevel = false,
  className = '',
}: WarningPillProps) {
  const chipClass =
    WARNING_LEVEL_META[warning.level]?.chipClass ??
    'bg-score-fair/15 text-score-fair border-score-fair/40';
  const Icon = warning.seaState ? Waves : AlertTriangle;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border ${VARIANT_CLASS[variant]} ${chipClass} ${className}`.trim()}
      title={warningPillTitle(warning, locale)}
      {...(dataAttr ? { 'data-map-warning': dataAttr } : {})}
    >
      <Icon className={`${ICON_CLASS[variant]} shrink-0`} aria-hidden />
      {warning.label}
      {showLevel && (
        <span className="font-normal opacity-90">({warningLevelLabel(warning.level, locale)})</span>
      )}
    </span>
  );
}
