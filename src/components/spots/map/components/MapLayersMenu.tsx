'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Layers, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/cn';
import MapControlButton from '@/components/ui/MapControlButton';

export interface MapLayersMenuItem {
  key: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  pressed: boolean;
  disabled?: boolean;
  onToggle: () => void;
  /** Atributo data-* no botão do item (ex. 'data-map-sst-toggle'). */
  toggleAttr?: string;
  /** Tinta do ícone quando a camada está ligada (token da camada). */
  iconClass?: string;
  resetVisible?: boolean;
  onReset?: () => void;
  resetLabel?: string;
}

/**
 * Menu «Camadas» — overflow das camadas de dados do mapa (auditoria
 * 2026-09-16, C4): os primários ficam no chrome e as 8–9 camadas de dados
 * mudam-se para um popover com rótulos (melhor que a parede de ícones sem
 * label que existia — `hidden 2xl:inline` nunca aparecia em <1536px).
 *
 * GEOMETRIA: o trigger participa no layout do strip/pill via wrapper
 * `contents`, mas o popover é portalizado para document.body com
 * `position: fixed` ancorado ao rect do trigger — necessário porque o
 * strip mobile é overflow-x-auto e o hit-test do Chrome segue a árvore
 * DOM: mesmo fixed+z-alto, um descendente do scroller perdia para o
 * canvas Leaflet. No body, z-1250 compete no contexto da raiz acima da
 * shell fixed z-1050 do mapa. Fecha por clique fora, Escape, scroll
 * fora do popover e resize.
 */
export default function MapLayersMenu({
  label,
  items,
  direction = 'up',
  variant = 'hud',
}: {
  label: string;
  items: MapLayersMenuItem[];
  /** 'up' — HUD junto ao fundo; 'down' — toolbar no topo; 'left' — pilha
      direita do /mapa (UX v3 §2): painel ancorado à esquerda do trigger,
      alinhado ao topo deste. */
  direction?: 'up' | 'down' | 'left';
  /** 'hud' — MapControlButton quadrado; 'pill' — item da toolbar centrada. */
  variant?: 'hud' | 'pill';
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  /** ↑ no trigger abre no ÚLTIMO item (menu-button WAI-ARIA). */
  const lastFocusEdge = useRef<'start' | 'end' | null>(null);
  const activeCount = items.filter((i) => i.pressed).length;

  /** Itens navegáveis do popover (toggles + resets), na ordem visual. */
  const focusableItems = () =>
    Array.from(
      popRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [],
    );

  /**
   * O popover é portalizado — Tab/Shift+Tab dentro dele fecha e retoma a
   * ordem natural a partir do trigger (padrão menu-button WAI-ARIA).
   */
  const focusRelativeToTrigger = (dir: 1 | -1) => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const tabbables = Array.from(
      document.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]',
      ),
    ).filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0);
    const i = tabbables.indexOf(trigger);
    const next = tabbables[i + dir];
    (next ?? trigger).focus();
  };

  // Menu-button WAI-ARIA: ↓ abre e foca o primeiro item; ↑ abre no último.
  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (!open) {
      lastFocusEdge.current = e.key === 'ArrowUp' ? 'end' : 'start';
      toggleMenu();
    }
  };

  const onPopoverKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const focusables = focusableItems();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (focusables.length === 0) return;
      e.preventDefault();
      const idx = focusables.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === 'ArrowDown'
          ? (idx + 1) % focusables.length
          : (idx - 1 + focusables.length) % focusables.length;
      (idx === -1 ? focusables[0] : focusables[next]).focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusables[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      focusables[focusables.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      // Popover portalizado — Tab natural saía para o fim do body. Fecha e
      // retoma a ordem a partir do trigger (seguinte / anterior).
      e.preventDefault();
      setOpen(false);
      focusRelativeToTrigger(e.shiftKey ? -1 : 1);
    }
  };

  const toggleMenu = () => {
    if (!open) {
      const r = triggerRef.current?.getBoundingClientRect();
      if (r) {
        const w = Math.min(300, window.innerWidth - 32);
        if (direction === 'up') {
          setPos({
            bottom: window.innerHeight - r.top + 8,
            right: Math.max(
              16,
              Math.min(window.innerWidth - w - 16, window.innerWidth - r.right),
            ),
          });
        } else if (direction === 'left') {
          // Pilha à direita (UX v3 §2): o painel abre à esquerda do trigger,
          // topo alinhado — nunca cobre os botões restantes da pilha.
          setPos({
            top: Math.max(8, Math.min(window.innerHeight - 440, r.top)),
            right: window.innerWidth - r.left + 8,
          });
        } else {
          setPos({
            top: r.bottom + 8,
            left: Math.max(
              16,
              Math.min(
                window.innerWidth - w - 16,
                r.left + r.width / 2 - w / 2,
              ),
            ),
          });
        }
      }
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    // Abrir leva o foco ao primeiro item activo (ignora disabled) — sem isto
    // o popover portalizado ficava fora da ordem de Tab e inalcançável.
    const items = popRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
    const edge = lastFocusEdge.current;
    lastFocusEdge.current = null;
    (edge === 'end' ? items?.[items.length - 1] : items?.[0])?.focus();

    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || popRef.current?.contains(t)) return;
      // O alvo do clique recebe o foco logo a seguir — devolver ao trigger
      // só evita foco encalhado quando o alvo não é focável (canvas…).
      if (popRef.current?.contains(document.activeElement)) {
        triggerRef.current?.focus();
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Fecha só a camada de cima — sem stopPropagation o Escape chegava ao
      // listener do window e saía do fullscreen (ou fechava o sheet).
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onScroll = (e: Event) => {
      if (popRef.current?.contains(e.target as Node)) return;
      if (popRef.current?.contains(document.activeElement)) {
        triggerRef.current?.focus();
      }
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  if (items.length === 0) return null;

  const badge = activeCount > 0 && (
    <span
      aria-hidden
      className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-fg px-0.5 font-mono text-[10px] font-semibold leading-none text-bg-base"
    >
      {activeCount}
    </span>
  );

  return (
    <div ref={rootRef} className="contents">
      {variant === 'hud' ? (
        <MapControlButton
          ref={triggerRef}
          onClick={toggleMenu}
          onKeyDown={onTriggerKeyDown}
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="true"
          aria-controls={open ? menuId : undefined}
          title={label}
          data-map-layers-menu
          className="relative"
          pressed={open || undefined}
        >
          <Layers className="w-4 h-4" aria-hidden />
          {badge}
        </MapControlButton>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={toggleMenu}
          onKeyDown={onTriggerKeyDown}
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="true"
          aria-controls={open ? menuId : undefined}
          title={label}
          data-map-layers-menu
          className={cn(
            'relative flex h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap transition-colors duration-150 touch-manipulation',
            open || activeCount > 0
              ? 'bg-surface-2/[0.08] text-fg'
              : 'text-fg-muted hover:text-fg hover:bg-surface-2/[0.08]',
          )}
        >
          <Layers className="w-4 h-4 shrink-0" aria-hidden />
          <span className="hidden lg:inline">{label}</span>
          {badge}
        </button>
      )}

      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            id={menuId}
            role="group"
            aria-label={label}
            data-map-layers-popover="true"
            onKeyDown={onPopoverKeyDown}
            style={pos}
            className="fixed z-[1250] w-[min(300px,calc(100vw-2rem))] max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain rounded-card border border-divider bg-bg-elevated/95 backdrop-blur-md shadow-card p-1.5 flex flex-col gap-0.5"
          >
          {items.map((item) => (
            <div key={item.key} className="flex items-center gap-1">
              <button
                type="button"
                onClick={item.onToggle}
                disabled={item.disabled}
                aria-pressed={item.pressed}
                aria-label={item.label}
                title={item.hint}
                {...(item.toggleAttr ? { [item.toggleAttr]: true } : {})}
                className={cn(
                  'flex flex-1 items-center gap-2.5 min-h-[44px] min-w-0 px-2.5 rounded-input text-meta-sm font-medium text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent',
                  item.disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-surface-2/[0.08]',
                  item.pressed ? 'text-fg bg-surface-1/[0.06]' : 'text-fg-muted',
                )}
              >
                <span
                  className={cn(
                    'flex w-4 h-4 shrink-0 items-center justify-center [&>svg]:w-4 [&>svg]:h-4',
                    item.pressed && item.iconClass,
                  )}
                >
                  {item.icon}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.pressed && (
                  <Check className="w-4 h-4 shrink-0 text-fg" aria-hidden />
                )}
              </button>
              {item.resetVisible && (
                <button
                  type="button"
                  onClick={item.onReset}
                  aria-label={item.resetLabel}
                  title={item.resetLabel}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-input text-fg-subtle hover:text-fg hover:bg-surface-2/[0.08] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden />
                </button>
              )}
            </div>
          ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
