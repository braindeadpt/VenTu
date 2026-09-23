'use client';

import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import ForecastMeteogram from '@/components/spots/ForecastMeteogram';
import ForecastTable, {
  type ForecastHour,
} from '@/components/weather/ForecastTable';
import Button from '@/components/ui/Button';
import type { SportType } from '@/lib/sportRatings';
import type {
  ScoreWaveCorrection,
  ScoreWaveSource,
} from '@/lib/scoreConditions';
import { SpotTimelineIndexContext } from '@/components/spots/timeline/SpotTimelineProvider';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { timelineIndexToColumn } from '@/lib/forecastTimeline';

/**
 * Liga a previsão ao eixo de tempo partilhado SEM re-renderizar a tabela:
 * subscreve o índice mas renderiza `null` — destaque da coluna
 * (`data-tl-selected`), stripe do meteograma e scrollIntoView aplicam-se
 * por DOM. Um scrub de N passos custa N querySelectorAll, não N renders
 * de ~400 células. Sem provider (outras páginas) é um no-op.
 */
function ForecastTimelineSync({
  containerRef,
  epoch,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  /** Muda quando o conjunto visível muda (expandir/colapsar) — reaplica. */
  epoch: number;
}) {
  const ctx = useContext(SpotTimelineIndexContext);
  const index = ctx?.index ?? -1;
  const setIndex = ctx?.setIndex;
  const reducedMotion = usePrefersReducedMotion();
  const indexRef = useRef(index);
  const selfChange = useRef(false);

  // Clique numa coluna da tabela (data-tl-col = índice global) ou no
  // meteograma (colunas de largura fixa — índice por posição x).
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !setIndex) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const cell = target.closest('[data-tl-col]');
      if (cell && root.contains(cell)) {
        const i = Number(cell.getAttribute('data-tl-col'));
        if (Number.isFinite(i) && i !== indexRef.current) {
          selfChange.current = true;
          setIndex(i);
        }
        return;
      }
      const mg = target.closest<HTMLElement>('[data-tl-meteogram]');
      if (mg && root.contains(mg)) {
        const colW = Number(mg.getAttribute('data-tl-colw')) || 15;
        const count = Number(mg.getAttribute('data-tl-count')) || 0;
        const i = Math.floor((e.clientX - mg.getBoundingClientRect().left) / colW);
        if (i >= 0 && i < count && i !== indexRef.current) {
          selfChange.current = true;
          setIndex(i);
        }
      }
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [containerRef, setIndex]);

  // Destaque + scroll — corre a cada mudança de índice e quando o conjunto
  // visível muda (expandir/colapsar). Custo por passo: DOM, não render.
  useEffect(() => {
    indexRef.current = index;
    const root = containerRef.current;
    if (!root || index < 0) return;

    // Índice na raiz da secção — a mesma convenção de instrumentos/contexto
    // (specs e debug lêem a hora escolhida sem React).
    root.closest('section')?.setAttribute('data-spot-timeline-index', String(index));

    root.querySelectorAll('[data-tl-selected]').forEach((n) =>
      n.removeAttribute('data-tl-selected'),
    );

    const scroller = root.querySelector<HTMLElement>('[data-tl-start]');
    const start = Number(scroller?.getAttribute('data-tl-start')) || 0;
    const count = Number(scroller?.getAttribute('data-tl-count')) || 0;
    const col = timelineIndexToColumn(index, start, count);
    if (col !== null) {
      root
        .querySelectorAll(`[data-tl-col="${index}"]`)
        .forEach((n) => n.setAttribute('data-tl-selected', ''));
    }

    const mg = root.querySelector<HTMLElement>('[data-tl-meteogram]');
    const stripe = root.querySelector<HTMLElement>('[data-tl-stripe]');
    const mgColW = Number(mg?.getAttribute('data-tl-colw')) || 15;
    const mgCount = Number(mg?.getAttribute('data-tl-count')) || 0;
    if (stripe) {
      stripe.style.transform = `translateX(${index * mgColW}px)`;
      stripe.style.opacity = index < mgCount ? '1' : '0';
    }

    // Índice mudado noutra secção (régua, setas, autoplay): traz a coluna
    // para a vista — só se a tabela estiver visível no ecrã. Clique na
    // própria tabela (selfChange) não precisa de scroll — já está à vista.
    if (!selfChange.current) {
      const behavior: ScrollBehavior = reducedMotion ? 'auto' : 'smooth';
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const inViewport = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return r.bottom > 0 && r.top < vh;
      };
      if (col !== null && scroller && inViewport(scroller)) {
        root
          .querySelector<HTMLElement>(`[data-tl-col="${index}"]`)
          ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior });
      }
      const mgScroll = mg?.parentElement;
      if (mg && mgScroll && index < mgCount && inViewport(mgScroll)) {
        const left = index * mgColW;
        if (
          left < mgScroll.scrollLeft ||
          left + mgColW > mgScroll.scrollLeft + mgScroll.clientWidth
        ) {
          mgScroll.scrollTo({ left: Math.max(0, left - mgScroll.clientWidth / 2), behavior });
        }
      }
    }
    selfChange.current = false;
  }, [index, containerRef, epoch, reducedMotion]);

  return null;
}

/**
 * Secção 5 do contrato (docs/design/SPOT-PAGE.md) — dona: S3.
 * Previsão hora a hora (meteograma + tabela + Windguru + expandir). A S3
 * sincroniza-a com a hora escolhida do useSpotTimeline.
 */
export interface SpotForecastSectionProps {
  locale: string;
  isPt: boolean;
  isMobile: boolean;
  /** Horas completas da previsão (com score por hora). */
  hours: ForecastHour[];
  coastOrientation?: number;
  sport: SportType;
  /** Link externo Windguru (resolvido no client). */
  windguruUrl: string;
  waveSource?: ScoreWaveSource;
  waveCorrection?: ScoreWaveCorrection | null;
  /** Relógio de frescura (bakedAtMs até montar — guarda React #418). */
  nowMs?: number;
  copy: {
    /** «Previsão hora a hora». */
    title: string;
    windguruLink: string;
    /** Dica mobile de scroll da tabela. */
    forecastHint: string;
    expandForecast: string;
    collapseForecast: string;
    noForecast: string;
  };
}

export default function SpotForecastSection({
  locale,
  isPt,
  isMobile,
  hours,
  coastOrientation,
  sport,
  windguruUrl,
  waveSource,
  waveCorrection,
  nowMs,
  copy,
}: SpotForecastSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const syncRef = useRef<HTMLDivElement>(null);
  const forecastHours = useMemo(() => {
    if (expanded) return isMobile ? 72 : 120;
    return isMobile ? 36 : 48;
  }, [expanded, isMobile]);

  return (
    <section id="previsao" className="space-y-3 scroll-mt-32">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-h2 text-fg">{copy.title}</h2>
        <a
          href={windguruUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 min-h-[44px] -my-2 text-meta text-data-waves hover:text-data-waves/80"
        >
          {copy.windguruLink}
          <ExternalLink className="w-3.5 h-3.5" aria-hidden />
        </a>
      </div>
      {/* TODO: Windguru WRF 9km iframe — pending ToS review (see src/lib/windguru.ts) */}
      <p className="text-meta text-fg-muted md:hidden">{copy.forecastHint}</p>
      {hours.length > 0 ? (
        <>
          <div ref={syncRef} className="card-1 overflow-hidden p-3 md:p-4">
            <ForecastMeteogram
              hours={hours.slice(0, forecastHours)}
              coastOrientation={coastOrientation}
              isPt={isPt}
              nowMs={nowMs ?? Date.now()}
            />
            <ForecastTable
              hourly={hours}
              hours={forecastHours}
              sport={sport}
              coastOrientation={coastOrientation}
              locale={locale}
              compact={isMobile}
              waveSource={waveSource}
              waveCorrection={waveCorrection}
              nowMs={nowMs}
            />
            <ForecastTimelineSync containerRef={syncRef} epoch={forecastHours} />
          </div>
          {hours.length > (isMobile ? 36 : 48) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              rightIcon={
                expanded ? (
                  <ChevronUp className="w-4 h-4" aria-hidden />
                ) : (
                  <ChevronDown className="w-4 h-4" aria-hidden />
                )
              }
              locale={locale as 'pt' | 'en' | 'es' | 'de' | 'fr'}
            >
              {expanded ? copy.collapseForecast : copy.expandForecast}
            </Button>
          )}
        </>
      ) : (
        <div className="card-1 p-8 text-center text-body text-fg-subtle">
          {copy.noForecast}
        </div>
      )}
    </section>
  );
}
