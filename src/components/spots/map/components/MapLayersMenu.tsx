'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Layers, Map as MapIcon, RotateCcw, Satellite } from 'lucide-react';
import { cn } from '@/lib/cn';
import MapControlButton from '@/components/ui/MapControlButton';
import { getTranslation } from '@/lib/i18n';
import { ISOBATH_DEPTHS, ISOBATH_DEPTH_STYLE } from '@/lib/isobaths';
import { requestBasemapChange } from '@/lib/mapLayerBus';
import type { BasemapMode } from '@/components/spots/MapLayerToggle';
import { useMapUiData } from '../MapUiContext';
import type { mapUiLayersDict } from '@/lib/translations/mapUi/layers';

/** §8 (maquete desktop-*-3-layers) — grupos do menu Camadas. */
export type MapLayerGroup = 'time' | 'sea' | 'nav';

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
  /** §8 — grupo onde a linha aparece (derivado da chave quando ausente). */
  group?: MapLayerGroup;
  /** §8 — nome da camada como substantivo (derivado da chave quando ausente). */
  name?: string;
  /** §8 — linha de descrição em texto muted (cai no `hint` quando ausente). */
  description?: string;
  /** §8 — mini-legenda inline, visível com a camada ligada. */
  miniLegend?: React.ReactNode;
}

/** Chave → grupo (maquete: Tempo, Mar, Navegação). */
const GROUP_OF: Record<string, MapLayerGroup> = {
  hours: 'time',
  radar: 'time',
  isobaths: 'sea',
  hs: 'sea',
  sst: 'sea',
  currents: 'sea',
  bathymetry: 'sea',
  buoys: 'nav',
  seamarks: 'nav',
  coastalWarnings: 'nav',
};
const GROUP_ORDER: MapLayerGroup[] = ['time', 'sea', 'nav'];
/** Ordem das linhas dentro de cada grupo (maquete: 48 h, radar; isóbatas,
 *  Hs, SST, correntes, batimetria; boias, sinalização, avisos). */
const ORDER_OF: Record<string, number> = {
  hours: 0,
  radar: 1,
  isobaths: 0,
  hs: 1,
  sst: 2,
  currents: 3,
  bathymetry: 4,
  buoys: 0,
  seamarks: 1,
  coastalWarnings: 2,
};

const NAME_KEY: Record<string, keyof mapUiLayersDict> = {
  hours: 'layerHours',
  radar: 'layerRadar',
  isobaths: 'layerIsobaths',
  hs: 'layerHs',
  sst: 'layerSst',
  currents: 'layerCurrents',
  bathymetry: 'layerBathymetry',
  buoys: 'layerBuoys',
  seamarks: 'layerSeamarks',
  coastalWarnings: 'layerWarnings',
};

const GROUP_LABEL_KEY: Record<MapLayerGroup, keyof mapUiLayersDict> = {
  time: 'groupTime',
  sea: 'groupSea',
  nav: 'groupNav',
};

/* ---------- Mini-legendas inline (§8) — versões compactas das rampas da
 *  MapLegend: mesma escala/cores, sem o título (a linha já dá o nome). */

function LegendRamp({ gradient, labels }: { gradient: string; labels: string[] }) {
  return (
    <div>
      <div className="h-1.5 rounded-full mb-1" style={{ background: gradient }} />
      <div className="flex justify-between text-[9px] font-mono tabular-nums text-fg-subtle">
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  );
}

function IsobathsMiniLegend() {
  return (
    <div className="space-y-0.5" data-testid="isobaths-legend-rows">
      {ISOBATH_DEPTHS.map((depth) => {
        const s = ISOBATH_DEPTH_STYLE[depth];
        return (
          <div key={depth} className="flex items-center gap-1.5 text-[10px] text-fg-muted">
            <span
              className="w-4 h-[3px] rounded-full shrink-0"
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            <span className="tabular-nums">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function CurrentsMiniLegend() {
  return (
    <div>
      <div className="flex items-end justify-between h-5 mb-0.5 px-0.5" aria-hidden>
        {[
          { len: 7, op: 0.5 },
          { len: 11, op: 0.72 },
          { len: 15, op: 0.96 },
        ].map((s) => (
          <svg key={s.len} width={20} height={20} viewBox="0 0 22 22" className="text-data-water">
            <line
              x1="5" y1="16.5" x2={5 + s.len * 0.62} y2={16.5 - s.len * 0.62}
              stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity={s.op}
            />
            <circle cx={5 + s.len * 0.62} cy={16.5 - s.len * 0.62} r="1.55" fill="currentColor" opacity={s.op} />
          </svg>
        ))}
      </div>
      <div className="flex justify-between text-[9px] font-mono tabular-nums text-fg-subtle">
        <span>0.1</span>
        <span>0.2</span>
        <span>0.4+</span>
      </div>
    </div>
  );
}

function SeamarksMiniLegend({ marksLabel }: { marksLabel: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-fg-muted">
      <svg width="46" height="14" viewBox="0 0 46 14" aria-hidden>
        <rect x="2" y="3" width="6" height="8" rx="1" fill="none" stroke="#ef4444" strokeWidth="1.3" />
        <path d="M16 11 L20 3 L24 11 Z M16 8 L24 8" fill="none" stroke="#eab308" strokeWidth="1.3" strokeLinejoin="round" />
        <circle cx="34" cy="5" r="2.4" fill="none" stroke="#334155" strokeWidth="1.3" />
        <circle cx="34" cy="11" r="2.4" fill="#334155" />
      </svg>
      <span>{marksLabel}</span>
    </div>
  );
}

function WarningsMiniLegend({ zoneLabel, orcaLabel }: { zoneLabel: string; orcaLabel: string }) {
  return (
    <div className="flex flex-col gap-1 text-[10px] text-fg-muted">
      <span className="flex items-center gap-1.5">
        <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
          <rect x="1.5" y="1.5" width="11" height="11" fill="rgb(239 68 68 / 0.18)" stroke="#ef4444" strokeWidth="1.4" />
        </svg>
        {zoneLabel}
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="12" height="12" viewBox="0 0 28 28" aria-hidden>
          <circle cx="14" cy="16" r="10" fill="none" stroke="#f59e0b" strokeWidth="1.4" strokeDasharray="2.5 4" opacity="0.7" />
          <path d="M14.2 6.5 C17.2 10.6 18.1 15.5 17.2 21.5 L10.2 21.5 C10.1 15.2 11.2 10.4 14.2 6.5 Z" fill="rgb(15 23 42)" stroke="rgb(226 232 240)" strokeWidth="1" strokeLinejoin="round" />
        </svg>
        {orcaLabel}
      </span>
    </div>
  );
}

type Translation = ReturnType<typeof getTranslation>;

/** Mini-legenda por chave de camada — derivada aqui para o popover servir
 *  tanto os itens do strip (M2) como os do sheet (M5). */
function miniLegendFor(key: string, t: Translation): React.ReactNode {
  switch (key) {
    case 'isobaths':
      return <IsobathsMiniLegend />;
    case 'hs':
      return (
        <LegendRamp
          gradient="linear-gradient(to right, rgb(3 105 161 / 0.48), rgb(14 165 233 / 0.78) 42%, rgb(14 165 233 / 0.92) 70%, rgb(241 245 249 / 0.88))"
          labels={['0.5', '0.9', '2.4+']}
        />
      );
    case 'sst':
      return (
        <LegendRamp
          gradient="linear-gradient(to right, rgb(var(--data-water) / 0.55), rgb(var(--data-water) / 0.8) 48%, rgb(var(--data-period) / 0.92))"
          labels={['14', '18', '22+']}
        />
      );
    case 'currents':
      return <CurrentsMiniLegend />;
    case 'bathymetry':
      return (
        <LegendRamp
          gradient="linear-gradient(to right, #ef4444 0%, #fbbf24 12%, #4ade80 30%, #22d3ee 52%, #1d4ed8 75%, #081c3f 100%)"
          labels={['0', '500', '4000+']}
        />
      );
    case 'seamarks':
      return <SeamarksMiniLegend marksLabel={t.map.seamarksLegendMarks} />;
    case 'coastalWarnings':
      return (
        <WarningsMiniLegend
          zoneLabel={t.map.coastalWarningsLegendZone}
          orcaLabel={t.map.coastalWarningsLegendOrca}
        />
      );
    default:
      return null;
  }
}

/* ---------- Secção «Base» (§8 + CORRECCOES-24SET M5) ----------
 * O rádio Mapa/Satélite saiu do painel/sheet para o menu Camadas. O estado
 * continua a viver em useMapCore — a leitura é o `data-basemap` do container
 * Leaflet deste mapa (fonte da verdade, MutationObserver) e a escrita vai
 * por `ventu:map-basemap` (evento em mapLayerBus). Zero estado duplicado. */

function useThisMapBasemap(
  rootRef: React.RefObject<HTMLElement | null>,
  open: boolean,
): BasemapMode {
  const [mode, setMode] = useState<BasemapMode>('map');
  // layout-effect: o sync do data-basemap corre antes do paint — o rádio
  // abre já marcado no modo real (sem flash do default 'map').
  useLayoutEffect(() => {
    const wrap = rootRef.current?.closest('[data-map-fullscreen]');
    const el = wrap?.querySelector('.leaflet-container');
    if (!el) return;
    const sync = () =>
      setMode(el.getAttribute('data-basemap') === 'satellite' ? 'satellite' : 'map');
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ['data-basemap'] });
    return () => mo.disconnect();
  }, [open, rootRef]);
  return mode;
}

/**
 * Menu «Camadas» — overflow das camadas de dados do mapa (auditoria
 * 2026-09-16, C4) reestruturado na M5 para a maquete v3 §8: secção «Base»
 * com o rádio Mapa/Satélite + grupos Tempo/Mar/Navegação, cada linha com
 * ícone, nome, descrição muted e switch de estado (aria-pressed); as camadas
 * ligadas mostram a mini-legenda inline por baixo.
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
  const [entered, setEntered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  /** ↑ no trigger abre no ÚLTIMO item (menu-button WAI-ARIA). */
  const lastFocusEdge = useRef<'start' | 'end' | null>(null);
  const activeCount = items.filter((i) => i.pressed).length;
  // O menu vive sempre dentro do MapUiProvider (montado pela MapControls);
  // o locale alimenta os cabeçalhos/nomes/descrições localizados do §8.
  const { locale } = useMapUiData();
  const t = getTranslation(locale);
  const layerNames = t.mapUiLayers;

  /** Itens navegáveis do popover (radios + toggles + resets), na ordem visual. */
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
        const w = Math.min(320, window.innerWidth - 32);
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

  // Entrada do popover — 180 ms out-expo (maquete pop3), só opacity/transform.
  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

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

  // §8 — ordenação por grupos: itens sem grupo conhecido ficam no fim,
  // sem cabeçalho (defensivo — chaves novas entram com `group` explícito).
  const { grouped, ungrouped } = useMemo(() => {
    const grouped: Record<MapLayerGroup, MapLayersMenuItem[]> = { time: [], sea: [], nav: [] };
    const ungrouped: MapLayersMenuItem[] = [];
    for (const item of items) {
      const g = item.group ?? GROUP_OF[item.key];
      if (g) grouped[g].push(item);
      else ungrouped.push(item);
    }
    for (const g of GROUP_ORDER) {
      grouped[g].sort(
        (a, b) => (ORDER_OF[a.key] ?? 99) - (ORDER_OF[b.key] ?? 99),
      );
    }
    return { grouped, ungrouped };
  }, [items]);

  if (items.length === 0) return null;

  const badge = activeCount > 0 && (
    <span
      aria-hidden
      className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-fg px-0.5 font-mono text-[10px] font-semibold leading-none text-bg-base"
    >
      {activeCount}
    </span>
  );

  const itemName = (item: MapLayersMenuItem) =>
    item.name ?? (NAME_KEY[item.key] ? layerNames[NAME_KEY[item.key]] : item.label);

  const renderItem = (item: MapLayersMenuItem) => {
    const name = itemName(item);
    const desc = item.description ?? item.hint;
    const legend = item.miniLegend ?? (item.pressed ? miniLegendFor(item.key, t) : null);
    return (
      <div key={item.key} className="flex items-start gap-1">
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={item.onToggle}
            disabled={item.disabled}
            aria-pressed={item.pressed}
            aria-label={name}
            title={item.hint}
            {...(item.toggleAttr ? { [item.toggleAttr]: true } : {})}
            className={cn(
              'grid w-full grid-cols-[20px_1fr_auto] items-center gap-x-2.5 min-h-[44px] px-2.5 py-1.5 rounded-input text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent',
              item.disabled
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-surface-2/[0.08]',
            )}
          >
            <span
              className={cn(
                'flex w-4 h-4 shrink-0 items-center justify-center [&>svg]:w-4 [&>svg]:h-4',
                item.pressed ? (item.iconClass ?? 'text-fg') : 'text-fg-subtle',
              )}
            >
              {item.icon}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  'block text-meta-sm font-medium leading-tight truncate',
                  item.pressed ? 'text-fg' : 'text-fg-muted',
                )}
              >
                {name}
              </span>
              {desc && (
                <span className="block text-[11px] leading-snug text-fg-subtle truncate">
                  {desc}
                </span>
              )}
            </span>
            {/* Switch — estado visual da linha (aria-pressed no botão). */}
            <span
              aria-hidden
              className={cn(
                'relative w-8 h-[18px] rounded-full transition-colors duration-150',
                item.pressed ? 'bg-fg' : 'bg-divider-strong',
              )}
            >
              <span
                className={cn(
                  'absolute top-[2px] w-3.5 h-3.5 rounded-full bg-bg-elevated shadow-sm transition-transform duration-150',
                  item.pressed ? 'translate-x-[12px]' : 'translate-x-[2px]',
                )}
              />
            </span>
          </button>
          {item.pressed && legend && (
            <div className="pl-[42px] pr-2.5 pb-1.5 pt-0.5" data-map-layer-minilegend={item.key}>
              {legend}
            </div>
          )}
        </div>
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
    );
  };

  const groupHeader = (g: MapLayerGroup) => (
    <p
      key={`h-${g}`}
      className="px-2.5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle"
    >
      {layerNames[GROUP_LABEL_KEY[g]]}
    </p>
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
            className={cn(
              'fixed z-[1250] w-[min(320px,calc(100vw-2rem))] max-h-[min(70vh,560px)] overflow-y-auto overscroll-contain rounded-card border border-divider bg-bg-elevated/95 backdrop-blur-md shadow-card p-1.5 flex flex-col',
              direction === 'up' ? 'origin-bottom-right' : 'origin-top-right',
              'motion-safe:transition-[opacity,transform] motion-safe:duration-[180ms] motion-safe:ease-[cubic-bezier(.16,1,.3,1)]',
              entered ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.96]',
            )}
          >
            {/* §8 — «Base»: Mapa/Satélite (rádio). O estado vive em useMapCore;
                lê-se do data-basemap do container e escreve-se por evento. */}
            <p className="px-2.5 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
              {layerNames.groupBase}
            </p>
            <BasemapSection rootRef={rootRef} open={open} t={t} />

            {GROUP_ORDER.map((g) =>
              grouped[g].length === 0 ? null : (
                <div key={g}>
                  {groupHeader(g)}
                  {grouped[g].map(renderItem)}
                </div>
              ),
            )}
            {ungrouped.map(renderItem)}
          </div>,
          document.body,
        )}
    </div>
  );
}

function BasemapSection({
  rootRef,
  open,
  t,
}: {
  rootRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  t: Translation;
}) {
  const mode = useThisMapBasemap(rootRef, open);
  const rows: Array<{ mode: BasemapMode; icon: React.ReactNode; name: string; desc: string }> = [
    { mode: 'map', icon: <MapIcon className="w-4 h-4" aria-hidden />, name: t.spotsMap.mapWord, desc: t.mapUiLayers.basemapMapDesc },
    { mode: 'satellite', icon: <Satellite className="w-4 h-4" aria-hidden />, name: t.spotsMap.satellite, desc: t.mapUiLayers.basemapSatelliteDesc },
  ];
  return (
    <div role="radiogroup" aria-label={t.spotsMap.basemap} className="flex flex-col">
      {rows.map((r) => {
        const checked = mode === r.mode;
        return (
          <button
            key={r.mode}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={r.name}
            onClick={() => requestBasemapChange(r.mode)}
            data-map-basemap-radio={r.mode}
            className="grid grid-cols-[20px_1fr_auto] items-center gap-x-2.5 gap-y-0 min-h-[44px] px-2.5 py-1.5 rounded-input text-left transition-colors duration-150 hover:bg-surface-2/[0.08] focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className={cn('flex w-4 h-4 items-center justify-center', checked ? 'text-fg' : 'text-fg-subtle')}>
              {r.icon}
            </span>
            <span className="min-w-0">
              <span className={cn('block text-meta-sm font-medium leading-tight', checked ? 'text-fg' : 'text-fg-muted')}>
                {r.name}
              </span>
              <span className="block text-[11px] leading-snug text-fg-subtle truncate">{r.desc}</span>
            </span>
            <span
              aria-hidden
              className={cn(
                'w-4 h-4 rounded-full border-2 grid place-items-center transition-colors duration-150',
                checked ? 'border-fg' : 'border-divider-strong',
              )}
            >
              {checked && <span className="w-2 h-2 rounded-full bg-fg" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
