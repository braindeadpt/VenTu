/**
 * Shared state + copy for the buoy-layer notice UI (banner + compact HUD chip).
 *
 * The banner (`BuoyLayerNotice`) and the explore-mode chip (`BuoyLayerChip`)
 * must never diverge: both read the same health state, share the same
 * dismissal, and use the same copy builder. Centralising here guarantees
 * that.
 *
 * The dismissal is a module-level store (`useSyncExternalStore`): dismissing
 * on ANY surface (chip or banner) hides ALL of them immediately — not just on
 * the next reload — and the choice persists in localStorage (reason-specific)
 * until the layer heals.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  loadBuoyLayerHealth,
  type BuoyLayerStatus,
  type WmoLayerStatus,
} from '@/lib/buoyLayerHealth';

export interface BuoyNoticeDismissal {
  reason: string;
  dismissedAt: string;
}

export const BUOY_NOTICE_DISMISS_KEY = 'ventu.map.buoyNoticeDismissed';

function readStoredDismissal(): BuoyNoticeDismissal | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(BUOY_NOTICE_DISMISS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<BuoyNoticeDismissal>;
    return v && typeof v.reason === 'string'
      ? { reason: v.reason, dismissedAt: typeof v.dismissedAt === 'string' ? v.dismissedAt : '' }
      : null;
  } catch {
    return null;
  }
}

function writeStoredDismissal(reason: string): void {
  try {
    window.localStorage.setItem(
      BUOY_NOTICE_DISMISS_KEY,
      JSON.stringify({ reason, dismissedAt: new Date().toISOString() }),
    );
  } catch {
    /* private mode / quota */
  }
}

function clearStoredDismissal(): void {
  try {
    window.localStorage.removeItem(BUOY_NOTICE_DISMISS_KEY);
  } catch {
    /* noop */
  }
}

/**
 * Module store — every notice surface subscribes. `undefined` = not loaded
 * yet (lazily read from localStorage on first snapshot, like useSyncExternalStore
 * needs a stable reference).
 */
let dismissalCache: BuoyNoticeDismissal | null | undefined;
const dismissalListeners = new Set<() => void>();

function getDismissal(): BuoyNoticeDismissal | null {
  if (dismissalCache === undefined) dismissalCache = readStoredDismissal();
  return dismissalCache;
}

function setDismissal(next: BuoyNoticeDismissal | null): void {
  if (dismissalCache === next) return;
  dismissalCache = next;
  if (next) writeStoredDismissal(next.reason);
  else clearStoredDismissal();
  dismissalListeners.forEach((l) => l());
}

function subscribeDismissal(listener: () => void): () => void {
  dismissalListeners.add(listener);
  return () => {
    dismissalListeners.delete(listener);
  };
}

/**
 * One source of truth for the notice copy. `isHome` adapts the copy: 'spot'
 * talks about "this page", 'home' about "the map and cards" — the homepage
 * and the /mapa HUD have no single spot to point at.
 */
export function buoyLayerCopy(
  status: BuoyLayerStatus,
  wmo: WmoLayerStatus,
  isPt: boolean,
  isHome: boolean,
): { title: string; body: string; wmoNote: string } {
  /** Nota WMO: «WMO em baixo» / «WMO com leituras antigas» (só quando também falhou). */
  const wmoNote =
    wmo === 'down'
      ? isPt
        ? ' O fallback WMO (Copernicus) também está em baixo.'
        : ' The WMO fallback (Copernicus) is also down.'
      : wmo === 'stale'
        ? isPt
          ? ' O fallback WMO (Copernicus) só tem leituras antigas.'
          : ' The WMO fallback (Copernicus) only has stale readings.'
        : '';

  const copy: Record<BuoyLayerStatus, { title: string; body: string }> = {
    'no-key': {
      title: isPt ? 'Onda observada desactivada' : 'Observed wave disabled',
      body: isPt
        ? isHome
          ? 'Sem leituras de boia: a IH_API_KEY não está configurada na pipeline. As alturas de onda no mapa e nos cards são previsão do modelo.'
          : 'Sem leituras de boia: a IH_API_KEY não está configurada na pipeline. As alturas de onda nesta página são previsão do modelo.'
        : isHome
          ? 'No buoy readings: IH_API_KEY is not configured in the pipeline. Wave heights on the map and cards are model forecasts.'
          : 'No buoy readings: IH_API_KEY is not configured in the pipeline. Wave heights on this page are model forecasts.',
    },
    down: {
      title: isPt ? 'Boias do IH indisponíveis' : 'IH buoys unavailable',
      body: isPt
        ? 'O serviço de boias do Instituto Hidrográfico está em baixo — sem leituras de onda observada por agora.'
        : 'The Instituto Hidrográfico buoy service is down — no measured wave readings right now.',
    },
    stale: {
      title: isPt ? 'Leituras das boias antigas' : 'Stale buoy readings',
      body: isPt
        ? isHome
          ? 'As leituras das boias têm mais de 3 h — as alturas de onda no mapa e nos cards são previsão do modelo.'
          : 'As leituras das boias têm mais de 3 h — a altura de onda acima é previsão do modelo.'
        : isHome
          ? 'Buoy readings are older than 3 h — wave heights on the map and cards are model forecasts.'
          : 'Buoy readings are older than 3 h — wave height above is a model forecast.',
    },
    ok: { title: '', body: '' },
  };

  const c = copy[status];
  return { title: c.title, body: c.body, wmoNote };
}

/**
 * Shared state for every buoy-notice surface: health (null = layer healthy),
 * WMO fallback state, the shared dismissal, and the dismiss action.
 *
 * «Só até uma fonte ficar saudável»: when the layer is OK (status null, AFTER
 * the health-check resolves) the dismissal is cleared — the next failure
 * warns again. The `loaded` flag prevents the mount (initial status null)
 * from clearing the choice before we know the real state.
 */
export function useBuoyLayerNotice(): {
  status: BuoyLayerStatus | null;
  wmo: WmoLayerStatus;
  dismissed: BuoyNoticeDismissal | null;
  dismiss: () => void;
} {
  const [status, setStatus] = useState<BuoyLayerStatus | null>(null);
  const [wmo, setWmo] = useState<WmoLayerStatus>('down');
  const [loaded, setLoaded] = useState(false);
  // getServerSnapshot: no SSR a dispensa nunca existe (localStorage é só cliente).
  const dismissed = useSyncExternalStore(subscribeDismissal, getDismissal, () => null);

  useEffect(() => {
    let cancelled = false;
    loadBuoyLayerHealth()
      .then((h) => {
        if (cancelled) return;
        setStatus(h.status);
        setWmo(h.wmo);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('no-key');
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded || status !== null) return;
    setDismissal(null);
  }, [loaded, status]);

  const dismiss = () => {
    if (!status) return;
    setDismissal({ reason: status, dismissedAt: new Date().toISOString() });
  };

  return { status, wmo, dismissed, dismiss };
}