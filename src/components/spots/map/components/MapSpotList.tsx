'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Thermometer, Timer, Waves, Wind } from 'lucide-react';
import { getScoreTokens } from '@/lib/sportScore';
import type { ScoreFactorSegment } from '@/lib/spotScoreFactors';

/**
 * Lista sincronizada com a vista do mapa — partilhada entre o bottom sheet
 * mobile (estado «aberto») e o painel lateral desktop. Mesma fonte de dados
 * que os marcadores: as linhas chegam já ordenadas por score, calculado com
 * `getBestScore(d, sport, hourScores)` — o mesmo número que o marcador mostra.
 *
 * Layout (maquete aprovada, MAP-UX-V3 §5): linhas de 64 px com mosaico do
 * score 44×44 à esquerda, nome até duas linhas SEM reticências, região e
 * métricas neutras (fg-muted + ícones Lucide, valores em mono) — «1,2 m ·
 * 11 s · off 12 kt». No cabeçalho: «Nesta vista» + chips «Saltar para»
 * (Continente · Açores · Madeira) e a nota de ordenação.
 *
 * Teclado: roving tabindex — ↑/↓ navegam entre linhas, Enter abre o spot.
 *
 * Hover bidireccional (maquete `setHover`): hover na linha liga
 * `.ventu-list-hover` no marcador Leaflet (o elemento expõe data-spot-id
 * desde o M3 em mapMarkers.ts) e hover no marcador realça a linha. O
 * MapUiContext é read-only nesta fase — a ponte é o DOM partilhado; a M6
 * pode reconduzi-la a estado de contexto se quiser.
 */
export interface MapSpotListRow {
  spotId: string;
  name: string;
  region: string;
  score: number;
  /** Factores do score — mesma gramática do popup/sheet (versão curta). */
  factors: ScoreFactorSegment[];
}

export interface MapListJump {
  id: string;
  label: string;
}

interface MapSpotListProps {
  rows: MapSpotListRow[];
  /** «Nesta vista» — título da lista. */
  title: string;
  /** Contagem já formatada, ex. «32 spots». */
  countLabel: string;
  /** Nota de ordenação — «Ordenado por score · métricas de agora». */
  noteLabel: string;
  emptyLabel: string;
  hintLabel?: string;
  /** Chips «Saltar para» (Continente · Açores · Madeira) no cabeçalho. */
  jumpLabel?: string;
  jumps?: MapListJump[];
  onJump?: (id: string) => void;
  /** Deep link ?spot= — a linha correspondente ganha destaque e foco inicial. */
  focusSpotId?: string;
  onSelect: (row: MapSpotListRow) => void;
  listLabel: string;
}

/** Ícone neutro por tipo de factor — as cores do escalão ficam no mosaico. */
function FactorIcon({ kind }: { kind: ScoreFactorSegment['kind'] }) {
  const cls = 'h-3 w-3 shrink-0 text-fg-subtle';
  switch (kind) {
    case 'waves':
    case 'swell':
    case 'flat':
      return <Waves className={cls} aria-hidden />;
    case 'period':
      return <Timer className={cls} aria-hidden />;
    case 'wind':
      return <Wind className={cls} aria-hidden />;
    case 'water':
      return <Thermometer className={cls} aria-hidden />;
    default:
      return null;
  }
}

export default function MapSpotList({
  rows,
  title,
  countLabel,
  noteLabel,
  emptyLabel,
  hintLabel,
  jumpLabel,
  jumps,
  onJump,
  focusSpotId,
  onSelect,
  listLabel,
}: MapSpotListProps) {
  const [activeIdx, setActiveIdx] = useState(() =>
    Math.max(0, rows.findIndex((r) => r.spotId === focusSpotId)),
  );
  const listRef = useRef<HTMLDivElement>(null);
  const focusedOnceRef = useRef(false);

  // ── Hover bidireccional com o marcador ──
  // Linha → marcador: liga/desliga .ventu-list-hover no divIcon (anel —
  // a mesma sombra do :hover do marcador, em globals.css).
  const highlightMarker = useCallback((spotId: string | null) => {
    document
      .querySelectorAll('.leaflet-marker-icon.spot-marker.ventu-list-hover')
      .forEach((m) => m.classList.remove('ventu-list-hover'));
    if (!spotId) return;
    document
      .querySelector(`.leaflet-marker-icon.spot-marker[data-spot-id="${CSS.escape(spotId)}"]`)
      ?.classList.add('ventu-list-hover');
  }, []);
  // Desmontar a lista (sheet fechado, mudança de estado) limpa o anel.
  useEffect(() => () => highlightMarker(null), [highlightMarker]);

  // Marcador → linha: delegação no document — os marcadores são divIcons
  // do Leaflet, fora da árvore React da lista.
  const [markerHoverId, setMarkerHoverId] = useState<string | null>(null);
  useEffect(() => {
    const markerOf = (el: EventTarget | null) =>
      el instanceof HTMLElement
        ? el.closest('.leaflet-marker-icon.spot-marker[data-spot-id]')
        : null;
    const onOver = (e: PointerEvent) => {
      const m = markerOf(e.target);
      setMarkerHoverId(m ? m.getAttribute('data-spot-id') : null);
    };
    const onOut = (e: PointerEvent) => {
      // Só limpa quando o ponteiro sai mesmo do marcador (não entre filhos).
      if (markerOf(e.target) && !markerOf(e.relatedTarget)) setMarkerHoverId(null);
    };
    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
    };
  }, []);

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
      // Como na maquete: navegar por teclado também acende o marcador.
      highlightMarker(rows[next]?.spotId ?? null);
      return next;
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* M6#3 (CORRECCOES-24SET): «Nesta vista · n spots» nunca quebra —
          os chips de ilha caem para a linha de baixo quando faltar largura. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-divider px-1 pb-1.5 pt-2.5">
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span className="font-display font-bold text-body-sm text-fg">{title}</span>
          <span className="font-mono tabular-nums text-meta-sm text-fg-subtle">{countLabel}</span>
        </span>
        {jumps && jumps.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-1" role="group" aria-label={jumpLabel}>
            {jumps.map((j) => (
              <button
                key={j.id}
                type="button"
                onClick={() => onJump?.(j.id)}
                className="inline-flex min-h-[28px] items-center rounded-pill border border-divider px-2.5 text-meta-sm font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-2/[0.08] hover:text-fg"
              >
                {j.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="px-1 pb-1.5 text-meta-sm text-fg-subtle">{noteLabel}</p>
      {rows.length === 0 ? (
        <p className="px-1 py-6 text-center text-meta-sm text-fg-muted">{emptyLabel}</p>
      ) : (
        <div
          ref={listRef}
          role="listbox"
          aria-label={listLabel}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          // Como na maquete: sair da lista (rato ou foco) apaga o anel.
          onMouseLeave={() => highlightMarker(null)}
          onBlur={(e) => {
            if (!listRef.current?.contains(e.relatedTarget as Node)) highlightMarker(null);
          }}
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
            // Linha realçada quando o marcador correspondente está em hover
            // (direcção marcador→linha do hover bidireccional).
            const markerHovered = row.spotId === markerHoverId;
            return (
              <button
                key={row.spotId}
                type="button"
                role="option"
                aria-selected={focused || i === activeIdx}
                data-spot-id={row.spotId}
                data-row-index={i}
                {...(markerHovered ? { 'data-marker-hover': 'true' } : {})}
                tabIndex={i === activeIdx ? 0 : -1}
                onClick={() => { setActiveIdx(i); onSelect(row); }}
                onFocus={() => setActiveIdx(i)}
                onMouseEnter={() => highlightMarker(row.spotId)}
                className={`grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-card px-2 py-2 min-h-[64px] text-left transition-colors duration-150 hover:bg-surface-1/[0.06] focus-visible:outline-2 focus-visible:outline-accent ${focused || markerHovered ? 'bg-surface-1/[0.06]' : ''}`}
              >
                <span
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-[10px] font-mono text-base font-semibold tabular-nums ${tok.bg} ${tok.text}`}
                >
                  {row.score}
                </span>
                <span className="min-w-0">
                  {/* Nome até duas linhas, sem reticências (maquete). */}
                  <span className="block text-body-sm font-medium leading-snug text-fg">{row.name}</span>
                  <span className="block truncate text-meta-sm text-fg-muted">{row.region}</span>
                  <span
                    className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-meta-sm text-fg-muted"
                    data-score-factors={row.factors.map((f) => f.label).join(' · ')}
                  >
                    {row.factors.map((f, fi) => (
                      <span key={fi} className="inline-flex items-center gap-1">
                        <FactorIcon kind={f.kind} />
                        <span className="font-mono tabular-nums">{f.short}</span>
                      </span>
                    ))}
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 shrink-0 text-fg-subtle" aria-hidden />
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
