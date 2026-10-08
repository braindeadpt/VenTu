'use client';

import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

/**
 * Selector «Vento | Ondulação | Nenhum» — sempre visível no topo-centro do
 * /mapa (maquete aprovada). Liga uma camada de campo de cada vez: as duas
 * pintam o mar inteiro e a legenda segue a escolha.
 *
 * Acessibilidade: role="radiogroup" + role="radio" com aria-checked,
 * tabindex itinerante (só o activo entra no Tab), setas ←/→/↑/↓, Home/End
 * (padrão WAI-ARIA radio group), alvos ≥ 44 px de altura no mobile.
 */
export type MapSeaMode = 'wind' | 'swell' | 'none';

export const MAP_SEA_MODES: readonly MapSeaMode[] = ['wind', 'swell', 'none'] as const;

export interface MapSeaModeLabels {
  group: string;
  wind: string;
  swell: string;
  none: string;
}

export default function MapSeaModeSwitch({
  value,
  onChange,
  labels,
  className,
}: {
  value: MapSeaMode;
  onChange: (mode: MapSeaMode) => void;
  labels: MapSeaModeLabels;
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (to: number) => {
    const n = MAP_SEA_MODES.length;
    const i = ((to % n) + n) % n;
    onChange(MAP_SEA_MODES[i]);
    refs.current[i]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        move(i + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        move(i - 1);
        break;
      case 'Home':
        e.preventDefault();
        move(0);
        break;
      case 'End':
        e.preventDefault();
        move(MAP_SEA_MODES.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={labels.group}
      data-map-sea-mode={value}
      className={cn(
        'inline-flex h-11 items-center gap-0.5 rounded-pill border border-divider bg-bg-elevated p-1 shadow-card',
        className,
      )}
    >
      {MAP_SEA_MODES.map((mode, i) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-map-sea-mode-option={mode}
            onClick={() => onChange(mode)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'relative h-9 min-w-[44px] whitespace-nowrap rounded-pill px-3 text-[13px] font-medium',
              'transition-colors duration-150 motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg-elevated',
              // alvo de toque ≥ 44 px sem engrossar a pill (pseudo-área)
              "after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
              active
                ? 'bg-accent font-semibold text-bg-base'
                : 'text-fg-muted hover:bg-surface-2/[0.08] hover:text-fg',
            )}
          >
            {labels[mode]}
          </button>
        );
      })}
    </div>
  );
}
