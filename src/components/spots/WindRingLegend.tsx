'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { getTranslation } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import {
  buildWindRingMarkerHtml,
  WIND_RING_LEGEND_SAMPLE,
} from '@/lib/mapWindArrow';
import { getScoreRgb } from '@/lib/map-constants';
import { markWindRingLegendSeen } from '@/lib/windRingLegend';
import Button from '@/components/ui/Button';

const MOBILE_MAX = 767;

interface WindRingLegendProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  locale: string;
}

export default function WindRingLegend({
  open,
  onClose,
  anchorRef,
  locale,
}: WindRingLegendProps) {
  const loc = (locale === 'pt' ? 'pt' : 'en') as Locale;
  const copy = getTranslation(loc).map.windRingLegend;
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [anchorPos, setAnchorPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const sampleHtml = (() => {
    const { score, fromDeg, speedKt, coastOrientation } = WIND_RING_LEGEND_SAMPLE;
    return buildWindRingMarkerHtml(
      score,
      getScoreRgb(score),
      fromDeg,
      speedKt,
      true,
      loc,
      coastOrientation,
    );
  })();

  const handleDismiss = useCallback(() => {
    markWindRingLegendSeen();
    onClose();
  }, [onClose]);

  useLayoutEffect(() => {
    if (!open || isMobile || !anchorRef.current) {
      setAnchorPos(null);
      return;
    }
    const update = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchorPos({
        top: rect.top - 10,
        left: rect.left + rect.width / 2,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, isMobile, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusables = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const t = window.setTimeout(() => first?.focus(), 50);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleDismiss();
        return;
      }
      if (e.key !== 'Tab' || focusables.length === 0) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, handleDismiss]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    if (isMobile) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

  if (!mounted || !open) return null;

  const annotations = [
    { id: 'position', text: copy.position },
    { id: 'colors', text: copy.colors, swatches: true },
    { id: 'length', text: copy.length },
  ] as const;

  const panel = (
    <>
      {isMobile ? (
        <div
          className="fixed inset-0 z-[1200] bg-black/25 motion-reduce:transition-none transition-opacity duration-250"
          aria-hidden
          onClick={handleDismiss}
        />
      ) : null}

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'z-[1210] border border-divider bg-bg-elevated shadow-modal motion-reduce:transition-none',
          isMobile
            ? 'fixed inset-x-0 bottom-0 rounded-t-2xl px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[min(85dvh,520px)] overflow-y-auto transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]'
            : 'fixed w-[min(100vw-1.5rem,340px)] rounded-card px-4 py-4 transition-[opacity,transform] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)]',
        )}
        style={
          isMobile
            ? undefined
            : anchorPos
              ? {
                  top: anchorPos.top,
                  left: anchorPos.left,
                  transform: 'translate(-50%, -100%)',
                }
              : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
        }
      >
        {isMobile ? (
          <div className="flex justify-center pb-2" aria-hidden>
            <div className="w-8 h-1 rounded-full bg-fg-subtle/30" />
          </div>
        ) : null}

        <h2 id={titleId} className="text-body-sm font-semibold text-fg mb-3 pr-1">
          {copy.title}
        </h2>

        <div
          className="flex justify-center py-3 mb-3 rounded-lg bg-surface-1/[0.04] border border-divider [&_.ventu-wind-ring-marker-wrap]:scale-[2] [&_.ventu-wind-ring-marker-wrap]:origin-center"
          aria-hidden
          dangerouslySetInnerHTML={{ __html: sampleHtml }}
        />

        <ol className="space-y-2 mb-3 list-none p-0 m-0">
          {annotations.map((item, index) => (
            <li
              key={item.id}
              className="flex gap-2 text-meta-sm text-fg-muted leading-snug"
              aria-label={'swatches' in item && item.swatches ? copy.colors : item.text}
            >
              <span className="font-mono tabular-nums text-fg-subtle shrink-0 w-4 text-right">
                {index + 1}.
              </span>
              {'swatches' in item && item.swatches ? (
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-windDir-offshore shrink-0" aria-hidden />
                    {copy.offshore}
                  </span>
                  <span className="text-fg-subtle" aria-hidden>
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-windDir-onshore shrink-0" aria-hidden />
                    {copy.onshore}
                  </span>
                  <span className="text-fg-subtle" aria-hidden>
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-windDir-cross shrink-0" aria-hidden />
                    {copy.cross}
                  </span>
                </span>
              ) : (
                <span>{item.text}</span>
              )}
            </li>
          ))}
        </ol>

        <p className="text-meta-sm font-medium text-fg mb-4 leading-snug">{copy.rule}</p>

        <Button
          type="button"
          size="md"
          className="w-full"
          locale={loc}
          onClick={handleDismiss}
        >
          {copy.dismiss}
        </Button>
      </div>
    </>
  );

  return createPortal(panel, document.body);
}
