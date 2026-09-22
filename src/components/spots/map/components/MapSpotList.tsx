'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { getScoreTokens } from '@/lib/sportScore';

/**
 * Lista sincronizada com a vista do mapa — partilhada entre o bottom sheet
 * mobile (estado «aberto») e o painel lateral desktop. Mesma fonte de dados
 * que os marcadores: as linhas chegam já ordenadas por score, calculado com
 * `getBestScore(d, sport, hourScores)` — o mesmo número que o marcador mostra.
 *
 * Teclado: roving tabindex — ↑/↓ navegam entre linhas, Enter abre o spot.
 */
export interface MapSpotListRow {
  spotId: string;
  name: string;
  region: string;
  score: number;
  /** Linha mono de factores, ex. «1.8 m · 11 s · NW 14 kt». */
  factors: string;
}

interface MapSpotListProps {
  rows: MapSpotListRow[];
  /** «Nesta vista» — título da lista. */
  title: string;
  /** Contagem já formatada, ex. «32 spots». */
  countLabel: string;
  sortLabel: string;
  emptyLabel: string;
  hintLabel?: string;
  /** Deep link ?spot= — a linha correspondente ganha destaque e foco inicial. */
  focusSpotId?: string;
  onSelect: (row: MapSpotListRow) => void;
  listLabel: string;
}

export default function MapSpotList({
  rows,
  title,
  countLabel,
  sortLabel,
  emptyLabel,
  hintLabel,
  focusSpotId,
  onSelect,
  listLabel,
}: MapSpotListProps) {
  const [activeIdx, setActiveIdx] = useState(() =>
    Math.max(0, rows.findIndex((r) => r.spotId === focusSpotId)),
  );
  const listRef = useRef<HTMLDivElement>(null);
  const focusedOnceRef = useRef(false);

  // Deep link: centra a linha do spot e dá-lhe foco uma vez (o utilizador
  // mantém depois o controlo do foco).
  useEffect(() => {
    if (focusedOnceRef.current || !focusSpotId) return;
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-spot-id="${CSS.escape(focusSpotId)}"]`);
    if (!el) return;
    focusedOnceRef.current = true;
    el.scrollIntoView({ block: 'nearest' });
    el.focus({ preventScroll: true });
  }, [focusSpotId, rows]);

  const move = (dir: 1 | -1) => {
    setActiveIdx((i) => {
      const next = Math.min(rows.length - 1, Math.max(0, i + dir));
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-row-index="${next}"]`)
        ?.focus();
      return next;
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline gap-2 px-1 pb-2">
        <span className="font-display font-bold text-body-sm text-fg">{title}</span>
        <span className="font-mono tabular-nums text-meta-sm text-fg-subtle">{countLabel}</span>
        <span className="ml-auto text-meta-sm text-fg-muted">{sortLabel}</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-1 py-6 text-center text-meta-sm text-fg-muted">{emptyLabel}</p>
      ) : (
        <div
          ref={listRef}
          role="listbox"
          aria-label={listLabel}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
            else if (e.key === 'Enter') {
              const row = rows[activeIdx];
              if (row) { e.preventDefault(); onSelect(row); }
            }
          }}
        >
          {rows.map((row, i) => {
            const tok = getScoreTokens(row.score);
            const focused = row.spotId === focusSpotId;
            return (
              <button
                key={row.spotId}
                type="button"
                role="option"
                aria-selected={focused || i === activeIdx}
                data-spot-id={row.spotId}
                data-row-index={i}
                tabIndex={i === activeIdx ? 0 : -1}
                onClick={() => { setActiveIdx(i); onSelect(row); }}
                onFocus={() => setActiveIdx(i)}
                className={`flex w-full items-center gap-2.5 rounded-input px-1.5 py-1.5 min-h-[52px] text-left transition-colors duration-150 hover:bg-surface-1/[0.06] focus-visible:outline-2 focus-visible:outline-accent ${focused ? 'bg-surface-1/[0.06]' : ''}`}
              >
                <span
                  className={`inline-flex w-10 h-10 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold ${tok.bg} ${tok.text}`}
                >
                  {row.score}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-semibold text-fg">{row.name}</span>
                  <span className="block truncate text-meta-sm text-fg-muted">{row.region}</span>
                </span>
                <span className="shrink-0 text-right font-mono tabular-nums text-meta-sm text-fg-muted">
                  {row.factors}
                </span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0 text-fg-subtle" aria-hidden />
              </button>
            );
          })}
        </div>
      )}
      {hintLabel && (
        <p className="px-1 pt-2 text-meta-sm text-fg-subtle">{hintLabel}</p>
      )}
    </div>
  );
}
