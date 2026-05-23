'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { ReactNode } from 'react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  side: 'left' | 'right';
  width?: number;
  title?: string;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const DRAG_CLOSE_THRESHOLD = 80; // px down to trigger close

export default function Drawer({
  isOpen,
  onClose,
  side,
  width = 420,
  title,
  children,
}: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const dragCurrentY = useRef<number>(0);
  const [dragOffset, setDragOffset] = useState(0);

  // Track viewport width
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Open/close animation
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
      setMounted(true);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      const timer = setTimeout(() => {
        setMounted(false);
        document.body.style.overflow = '';
        previousFocusRef.current?.focus();
      }, 320);
      return () => clearTimeout(timer);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Focus trap + Esc
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === 'Tab') {
      const el = drawerRef.current;
      if (!el) return;
      const focusable = el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }, [onClose]);

  // Auto-focus close button on open
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => {
        const closeBtn = drawerRef.current?.querySelector<HTMLButtonElement>('[data-drawer-close]');
        closeBtn?.focus();
      });
    }
  }, [visible]);

  // ── Touch handlers (mobile drag-to-close) ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return;
    dragStartY.current = e.touches[0].clientY;
    dragCurrentY.current = 0;
  }, [isMobile]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isMobile || dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    // Only allow dragging down (positive delta)
    if (delta > 0) {
      dragCurrentY.current = delta;
      setDragOffset(delta);
    }
  }, [isMobile]);

  const handleTouchEnd = useCallback(() => {
    if (!isMobile || dragStartY.current === null) return;
    if (dragCurrentY.current > DRAG_CLOSE_THRESHOLD) {
      onClose();
    }
    dragStartY.current = null;
    dragCurrentY.current = 0;
    setDragOffset(0);
  }, [isMobile, onClose]);

  if (!mounted) return null;

  const panelStyle: React.CSSProperties = {};
  if (isMobile) {
    panelStyle.height = '80vh';
    panelStyle.maxHeight = '80vh';
    if (!visible) {
      panelStyle.transform = 'translateY(100%)';
    } else if (dragOffset > 0) {
      // While dragging, follow finger; disable transition for smooth tracking
      panelStyle.transform = `translateY(${dragOffset}px)`;
      panelStyle.transition = 'none';
    } else {
      panelStyle.transform = 'translateY(0)';
    }
  } else {
    panelStyle.width = `${width}px`;
    panelStyle.maxWidth = '100vw';
    const offX = side === 'left' ? '-100%' : '100%';
    if (!visible) panelStyle.transform = `translateX(${offX})`;
    else panelStyle.transform = 'translateX(0)';
  }

  return (
    <div className="fixed inset-0 z-[1200]" role="presentation">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 transition-opacity duration-slow motion-reduce:transition-none ${
          visible ? 'bg-black/40 opacity-100' : 'bg-black/0 opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'drawer-title' : undefined}
        onKeyDown={handleKeyDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={[
          'fixed bg-bg-base border-divider shadow-2xl overflow-y-auto',
          'transition-transform duration-slow ease-out motion-reduce:transition-none',
          isMobile
            ? 'left-0 right-0 bottom-0 rounded-t-2xl border-t'
            : side === 'left'
              ? 'top-0 bottom-0 left-0 border-r'
              : 'top-0 bottom-0 right-0 border-l',
        ].join(' ')}
        style={panelStyle}
      >
        {/* Mobile drag handle */}
        {isMobile && (
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-8 h-1 rounded-full bg-fg-subtle/30" />
          </div>
        )}

        {/* Title + close */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-divider">
          {title ? (
            <h2 id="drawer-title" className="text-sm font-bold text-fg truncate">
              {title}
            </h2>
          ) : (
            <span />
          )}
          <button
            data-drawer-close
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-1 text-fg-subtle hover:text-fg transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 5l10 10M15 5l-10 10" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
}
