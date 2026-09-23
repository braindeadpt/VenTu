'use client';

/**
 * Bloco de filtros «Explorar» (MAP-UX-V3 §5) — partilhado entre o painel
 * desktop e o estado «half» do sheet mobile, como o `filtersHTML(prefix)`
 * da maquete aprovada:
 *
 *  1. Modalidade — segmented com ícone+rótulo que QUEBRA de linha (nunca
 *     scroll nem texto cortado);
 *  2. Região e Nível — selects nativos lado a lado, cada um com <label>;
 *  3. «Só a bombar» e «Agrupar spots» — switches (role="switch");
 *  4. Chips removíveis dos filtros activos + «Limpar» quando há algum.
 *
 * Todos os alvos têm ≥44 px (a densidade 36 px das pills só em rato fino,
 * via .filter-pill-compact) e os rótulos ficam sempre visíveis.
 */

import { useId } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { getTranslation } from '@/lib/i18n';
import { DEFAULT_REGION } from '@/lib/gridFilters';
import type { GridSportFilter } from '@/lib/sportRatings';
import type { MapDifficultyFilter } from '@/lib/mapDifficulty';
import type { MapHudSportOption } from '../../mapHudTypes';
import FilterPill from '@/components/ui/FilterPill';
import { cn } from '@/lib/cn';

/** Quantos filtros estão activos — alimenta o «Filtros (n)» do peek.
 *  A maquete conta só modalidade+região+nível: o «Só a bombar» já é um
 *  switch visível ao lado do botão, contá-lo duplicava o estado. */
export function countActiveExploreFilters(input: {
  sport: GridSportFilter;
  region: string;
  difficulty: MapDifficultyFilter;
}): number {
  return (
    (input.sport !== 'all' ? 1 : 0) +
    (input.region !== DEFAULT_REGION ? 1 : 0) +
    (input.difficulty !== 'all' ? 1 : 0)
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <p className="mb-1 text-meta-sm font-semibold uppercase tracking-wide text-fg-subtle">
      {htmlFor ? <label htmlFor={htmlFor}>{children}</label> : children}
    </p>
  );
}

/** Switch no estilo da maquete: rótulo à esquerda, track à direita. */
export function MapFilterSwitch({
  label,
  checked,
  onToggle,
  hint,
  toggleAttr,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  hint?: string;
  toggleAttr?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      title={hint}
      {...(toggleAttr ? { [toggleAttr]: true } : {})}
      className="flex min-h-[44px] w-full items-center justify-between gap-2.5 rounded-input px-1 text-left text-body-sm text-fg transition-colors duration-150 hover:text-fg"
    >
      <span>{label}</span>
      <span
        aria-hidden
        className={cn(
          'relative h-[22px] w-9 shrink-0 rounded-full border transition-colors duration-150',
          checked ? 'border-transparent bg-accent/90' : 'border-divider bg-surface-3/[0.12]',
        )}
      >
        <span
          className={cn(
            'absolute left-[2px] top-[2px] h-4 w-4 rounded-full bg-bg-elevated shadow-card transition-transform duration-150',
            checked && 'translate-x-[14px]',
          )}
        />
      </span>
    </button>
  );
}

/** Select nativo com chevron próprio (appearance-none) — o `.sel-wrap` da maquete. */
function FieldSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { id: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="min-w-0">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[40px] w-full appearance-none rounded-input border border-divider bg-surface-2/[0.08] pl-3 pr-8 text-meta text-fg cursor-pointer focus-visible:outline-2 focus-visible:outline-accent"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle"
          aria-hidden
        />
      </div>
    </div>
  );
}

interface MapExploreFiltersProps {
  /** Prefixo dos ids (painel «p», sheet «m») — os dois coexistem no DOM. */
  idPrefix: string;
  sports: MapHudSportOption[];
  selectedSport: GridSportFilter;
  onSportChange: (s: GridSportFilter) => void;
  regions: readonly string[];
  selectedRegion: string;
  onRegionChange: (r: string) => void;
  difficulties: { id: MapDifficultyFilter; label: string }[];
  selectedDifficulty: MapDifficultyFilter;
  onDifficultyChange: (d: MapDifficultyFilter) => void;
  difficultyGroupLabel: string;
  onlyOnEnabled: boolean;
  onToggleOnlyOn: () => void;
  /** Hint do toggle «Só a bombar» (title). */
  onlyOnHint?: string;
  clusterEnabled: boolean;
  onToggleCluster: () => void;
  onResetFilters: () => void;
  clearFiltersLabel: string;
  showClearFilters: boolean;
  locale: string;
}

export default function MapExploreFilters({
  idPrefix,
  sports,
  selectedSport,
  onSportChange,
  regions,
  selectedRegion,
  onRegionChange,
  difficulties,
  selectedDifficulty,
  onDifficultyChange,
  difficultyGroupLabel,
  onlyOnEnabled,
  onToggleOnlyOn,
  onlyOnHint,
  clusterEnabled,
  onToggleCluster,
  onResetFilters,
  clearFiltersLabel,
  showClearFilters,
  locale,
}: MapExploreFiltersProps) {
  const t = getTranslation(locale);
  const uid = useId().replace(/[:]/g, '');
  const sportLabelId = `${idPrefix}-sport-label-${uid}`;

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (selectedSport !== 'all') {
    const label = sports.find((s) => s.id === selectedSport)?.label ?? selectedSport;
    chips.push({ key: 'sport', label, clear: () => onSportChange('all') });
  }
  if (selectedRegion !== DEFAULT_REGION) {
    chips.push({ key: 'region', label: selectedRegion, clear: () => onRegionChange(DEFAULT_REGION) });
  }
  if (selectedDifficulty !== 'all') {
    const label = difficulties.find((d) => d.id === selectedDifficulty)?.label ?? selectedDifficulty;
    chips.push({ key: 'level', label, clear: () => onDifficultyChange('all') });
  }
  if (onlyOnEnabled) {
    chips.push({ key: 'onlyOn', label: t.map.onlyOn, clear: onToggleOnlyOn });
  }

  const clearAll = () => {
    onResetFilters();
    if (onlyOnEnabled) onToggleOnlyOn();
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Modalidade — segmented com quebra de linha (nunca scroll/corta). */}
      <div>
        <FieldLabel>
          <span id={sportLabelId}>{t.spotsMap.sportWord}</span>
        </FieldLabel>
        <div
          role="group"
          aria-labelledby={sportLabelId}
          className="flex flex-wrap items-center gap-1.5"
        >
          {sports.map((s) => (
            <FilterPill
              key={s.id}
              compact
              active={selectedSport === s.id}
              onClick={() => onSportChange(s.id)}
              icon={s.icon}
            >
              {s.label}
            </FilterPill>
          ))}
        </div>
      </div>

      {/* Região + Nível — selects lado a lado. */}
      <div className="grid grid-cols-2 gap-2">
        <FieldSelect
          id={`${idPrefix}-region-${uid}`}
          label={t.spotsMap.region}
          value={selectedRegion}
          options={regions.map((r) => ({ id: r, label: r }))}
          onChange={onRegionChange}
        />
        <FieldSelect
          id={`${idPrefix}-level-${uid}`}
          label={difficultyGroupLabel}
          value={selectedDifficulty}
          options={difficulties.map((d) => ({ id: d.id, label: d.label }))}
          onChange={(v) => onDifficultyChange(v as MapDifficultyFilter)}
        />
      </div>

      {/* Switches lado a lado — .sws da maquete (1fr 1fr). */}
      <div className="grid grid-cols-2 gap-x-4">
        <MapFilterSwitch
          label={t.map.onlyOn}
          checked={onlyOnEnabled}
          onToggle={onToggleOnlyOn}
          hint={onlyOnHint}
          toggleAttr="data-map-only-on-toggle"
        />
        <MapFilterSwitch
          label={t.map.clusterSpots}
          checked={clusterEnabled}
          onToggle={onToggleCluster}
        />
      </div>

      {/* Chips dos filtros activos + «Limpar». */}
      {(chips.length > 0 || showClearFilters) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.clear}
              aria-label={t.mapUiExplore.removeFilter.replace('{label}', c.label)}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-pill bg-surface-2/[0.08] pl-2.5 pr-1.5 text-meta-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-2/[0.14]"
            >
              {c.label}
              <X className="h-3 w-3 text-fg-subtle" aria-hidden />
            </button>
          ))}
          {showClearFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex min-h-[36px] items-center px-1.5 text-meta-sm font-semibold text-fg-muted underline-offset-2 transition-colors duration-150 hover:text-fg hover:underline"
            >
              {clearFiltersLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
