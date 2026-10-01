'use client';

import { useEffect, useRef, useState } from 'react';
import type { SportType } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import { getTranslation } from '@/lib/i18n';
import { formatHourLabel } from '@/lib/verdict/formatHourLabel';
import { cn } from '@/lib/cn';
import { useIpmaWarnings } from '@/hooks/useIpmaWarnings';
import {
  SEA_STATE_WARNING_TYPES,
  strongestSpotWarning,
  warningBadgeLabel,
} from '@/lib/ipmaWarnings';
import WarningPill from '@/components/ui/WarningPill';
import {
  useSpotTimelineData,
  useSpotTimelineIndex,
} from '@/components/spots/timeline/useSpotTimeline';
import SportTab from '@/components/spots/SportTab';

interface SpotUnifiedBarProps {
  locale: string;
  /** Spot id — resolve o chip do aviso IPMA activo («Mar perigoso»). */
  spotId: string;
  /** Lista canónica de modalidades (compatíveis do spot). */
  tabSports: SportType[];
  allScores: Record<SportType, SportScore>;
  selectedSport: SportType;
  onSelectSport: (sport: SportType) => void;
  /** aria-label da tablist (tv.sportTabsAria). */
  sportTabsAria: string;
  /** Score «agora» — fallback antes de o eixo montar. */
  nowScoreFallback: number;
}

const ANCHORS: ReadonlyArray<{ href: string; key: 'anchorSummary' | 'anchorHourly' | 'anchorOnSite' | 'anchorGettingThere' }> = [
  { href: '#agora', key: 'anchorSummary' },
  { href: '#previsao', key: 'anchorHourly' },
  { href: '#no-local', key: 'anchorOnSite' },
  { href: '#chegar', key: 'anchorGettingThere' },
];

/**
 * §2 da spec v3 (rev. CORRECCOES-24SET) — UMA barra: tabs de modalidade
 * com mini-score (roving ←/→ igual à linha antiga) SEMPRE visíveis por
 * baixo do hero, na posição da antiga linha de tabs. A barra está sempre
 * no fluxo e pina na cota partilhada `--ventu-spot-sticky-top` — nunca sai
 * da árvore de acessibilidade enquanto visível.
 *
 * Quando o hero (#agora) sai do ecrã, a MESMA barra fica fixa e ganha os
 * extras — chip score+hora, pill Agora/Previsão, aviso IPMA e âncoras —
 * com transição de 200 ms só nesses elementos (§7: transform+opacity
 * ease-out). No mobile as tabs deslizam por baixo do chip: ele tem fundo
 * sólido bg-base e um gradiente de 24 px à esquerda, e o tablist ganha
 * padding-right medido (ResizeObserver) para a última tab ficar
 * alcançável — a reserva é constante, logo a entrada dos extras não move
 * as tabs.
 */
export default function SpotUnifiedBar({
  locale,
  spotId,
  tabSports,
  allScores,
  selectedSport,
  onSelectSport,
  sportTabsAria,
  nowScoreFallback,
}: SpotUnifiedBarProps) {
  const tv = getTranslation(locale).spotPageVerdict;
  const { nowIndex } = useSpotTimelineData();
  const { selectedScore, selectedHour, isNow } = useSpotTimelineIndex();
  // Chip de segurança — a mesma resolução da SpotStickyBar antiga (aviso
  // agitação/vento mais forte do spot). Acompanha o scroll: um «Mar
  // perigoso» não pode desaparecer quando se desce na página.
  const warningsData = useIpmaWarnings();
  const warning = strongestSpotWarning(warningsData, spotId);

  const shownScore = selectedScore ?? nowScoreFallback;

  // Os extras (chip/âncoras) aparecem quando o hero sai do ecrã. Escondidos
  // de início (SSR incluído — o estado inicial é sempre «hero visível»), o
  // observer decide depois de montar; sem hero/observer ficam sempre
  // visíveis (fallback seguro). As TABS são sempre visíveis.
  const [heroGone, setHeroGone] = useState(false);
  useEffect(() => {
    const hero = document.getElementById('agora');
    if (!hero || typeof IntersectionObserver === 'undefined') {
      setHeroGone(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        // A última entrada é o estado actual: se houver scroll entre o observe()
        // e a 1.ª entrega, chegam duas do mesmo alvo e a [0] já é velha.
        const entry = entries[entries.length - 1];
        if (entry) setHeroGone(!entry.isIntersecting);
      },
      { threshold: 0 },
    );
    io.observe(hero);
    return () => io.disconnect();
  }, []);

  // Largura do grupo da direita (chip + âncoras) → padding-right do
  // tablist, para a última tab poder sair debaixo do chip no mobile.
  const rowRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const chip = chipRef.current;
    const row = rowRef.current;
    if (!chip || !row || typeof ResizeObserver === 'undefined') return;
    const update = () =>
      row.style.setProperty('--spot-bar-chip-w', `${Math.ceil(chip.offsetWidth)}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(chip);
    return () => ro.disconnect();
  }, []);

  // ←/→ na tablist: roving tabs, foco segue a selecção (mesma semântica da
  // linha standalone que esta barra substitui).
  const handleTabsKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const idx = tabSports.indexOf(selectedSport);
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const next = tabSports[(idx + dir + tabSports.length) % tabSports.length];
    onSelectSport(next);
    e.currentTarget
      .querySelector<HTMLButtonElement>(`#sport-tab-${next}`)
      ?.focus();
  };

  return (
    // A barra está sempre no fluxo e visível (as tabs são a antiga linha
    // de tabs): `sticky` pina-a quando o scroll a alcança. Só os extras
    // entram/saem — 200 ms ease-out em transform+opacity+visibility
    // (`visibility` na lista completa o fade antes de sair da a11y tree).
    <div
      role="region"
      aria-label={tv.barLabel}
      className="sticky z-30 border-b border-divider bg-bg-base supports-[backdrop-filter]:md:bg-bg-base/95 supports-[backdrop-filter]:md:backdrop-blur-sm"
      style={{ top: 'var(--ventu-spot-sticky-top)' }}
    >
      <div
        ref={rowRef}
        className="max-w-6xl mx-auto px-4 relative"
        style={{ height: 'var(--ventu-spot-tabs-h)' }}
      >
        <div
          role="tablist"
          aria-label={sportTabsAria}
          onKeyDown={handleTabsKeyDown}
          style={{
            height: 'var(--ventu-spot-tabs-h)',
            // Espaço reservado à direita = largura do chip + gradiente de
            // 24 px — a última tab desliza até ficar visível à esquerda dele.
            paddingRight: 'calc(var(--spot-bar-chip-w, 0px) + 24px)',
          }}
          className="flex items-center gap-1.5 -mx-4 px-4 min-w-0 overflow-x-auto overscroll-x-contain no-scrollbar edge-fade-x-end"
        >
          {tabSports.map((sport) => (
            <SportTab
              key={sport}
              sport={sport}
              score={allScores[sport].score}
              active={selectedSport === sport}
              onClick={() => onSelectSport(sport)}
              locale={locale}
            />
          ))}
        </div>

        {/* Extras — entram quando o hero sai do ecrã (200 ms só aqui):
            chip fixo à direita com fundo sólido + gradiente de 24 px à
            esquerda — as tabs desaparecem por baixo dele (mobile) e as
            âncoras vivem aqui no desktop. `invisible` tira-os da a11y
            tree e dos cliques enquanto o hero está no ecrã. */}
        <div
          ref={chipRef}
          data-testid="spot-bar-extras"
          className={cn(
            'absolute inset-y-0 right-4 flex items-center gap-2 bg-bg-base',
            'transition-[opacity,transform,visibility] duration-200 ease-out motion-reduce:transition-none',
            heroGone
              ? 'opacity-100 translate-y-0 visible'
              : 'opacity-0 -translate-y-2 invisible',
          )}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-6 w-6 bg-gradient-to-r from-transparent to-bg-base"
          />
          <span
            data-testid="spot-bar-score"
            className="font-mono text-num-sm font-semibold tabular-nums rounded-pill border border-divider-strong px-1.5 py-0.5"
            style={{ color: 'var(--verdict)' }}
            data-visual-dynamic
          >
            {shownScore}
          </span>
          <span className="font-mono text-num-sm tabular-nums text-fg">
            {selectedHour ? formatHourLabel(selectedHour, locale) : '--:--'}
          </span>
          {nowIndex >= 0 && (
            <span
              className={cn(
                'hidden sm:inline rounded-pill border px-1.5 py-0.5 text-meta-sm',
                isNow ? 'border-divider-strong text-fg' : 'border-divider text-fg-muted',
              )}
            >
              {isNow ? tv.nowLabel : tv.forecastLabel}
            </span>
          )}
          {warning && (
            <WarningPill
              warning={{
                level: warning.level,
                label: warningBadgeLabel(warning, locale),
                seaState: SEA_STATE_WARNING_TYPES.has(warning.type),
                areaLabel: warning.areaLabel,
                type: warning.type,
              }}
              locale={locale}
              variant="compact"
              dataAttr="compact"
            />
          )}

          <nav
            aria-label={tv.navLabel}
            className="hidden lg:flex items-center gap-1 shrink-0"
          >
            {ANCHORS.map((a) => (
              <a
                key={a.href}
                href={a.href}
                className="inline-flex items-center px-2 min-h-[44px] -my-2 text-meta-sm text-fg-muted hover:text-fg transition-colors duration-150"
              >
                {tv[a.key]}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
