'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  /** CSS selector for the scrollable container. Default: document. */
  scrollContainer?: string;
  /** Minimum pull distance in px to trigger refresh. Default: 60. */
  threshold?: number;
}

/**
 * Pull-to-refresh indicator for mobile.
 * Watches `touchmove` on the scroll container. When pulled down past
 * `threshold` px and released, fires `onRefresh`. Shows a spinner
 * during the refresh then fades out.
 *
 * Only active on touch devices (max-width: 767px media query via JS).
 */
export default function PullToRefresh({
  onRefresh,
  children,
  scrollContainer,
  threshold = 60,
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const pulling = useRef(false);
  const [pullDist, setPullDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsTouchDevice(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const getScrollTop = useCallback(() => {
    if (scrollContainer) {
      const el = document.querySelector(scrollContainer);
      return el ? el.scrollTop : 0;
    }
    return document.documentElement.scrollTop;
  }, [scrollContainer]);

  useEffect(() => {
    if (!isTouchDevice) return;
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      startY.current = e.touches[0].clientY;
      pulling.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (refreshing) return;
      if (getScrollTop() > 10) {
        setPullDist(0);
        return;
      }
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0) {
        pulling.current = true;
        // Clamp and dampen the visual pull distance
        setPullDist(Math.min(delta * 0.5, threshold * 1.4));
      }
    };

    const onTouchEnd = async () => {
      if (!pulling.current || refreshing) return;
      if (pullDist >= threshold) {
        setRefreshing(true);
        setPullDist(threshold);
        try {
          await onRefresh();
        } catch {
          /* noop */
        }
        setRefreshing(false);
      }
      setPullDist(0);
      pulling.current = false;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [isTouchDevice, refreshing, pullDist, getScrollTop, onRefresh, threshold]);

  // Reset after refresh completes
  useEffect(() => {
    if (!refreshing) {
      const timeout = setTimeout(() => setPullDist(0), 200);
      return () => clearTimeout(timeout);
    }
  }, [refreshing]);

  return (
    <div ref={containerRef} className="ptr-container">
      {/* Visual indicator — only active during pull or refresh */}
      <div
        className="ptr-indicator"
        style={{
          height: refreshing ? 48 : Math.min(pullDist, 48),
          opacity: refreshing ? 1 : pullDist > 0 ? Math.min(pullDist / threshold, 1) : 0,
          transition: refreshing
            ? 'height 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease'
            : 'none',
        }}
      >
        {refreshing ? (
          <div className="ptr-spinner" />
        ) : pullDist >= threshold ? (
          <span
            className="inline-block text-accent font-mono tabular-nums text-meta font-semibold"
            style={{
              transform: `rotate(${Math.min(pullDist - threshold, 30) * 3}deg)`,
              transition: 'transform 60ms ease-out',
            }}
          >
            ↻
          </span>
        ) : (
          <span
            className="inline-block text-fg-muted font-mono text-sm"
            style={{
              transform: `rotate(${Math.min(pullDist * 2, 180)}deg)`,
              transition: 'transform 60ms ease-out',
            }}
          >
            ↓
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
