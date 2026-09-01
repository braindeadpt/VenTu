'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  loadBuoyLayerHealth,
  type BuoyLayerStatus,
  type WmoLayerStatus,
} from '@/lib/buoyLayerHealth';

/**
 * Honest notice when the measured-wave layer can't produce readings for a
 * spot: distinguishes "IH_API_KEY não configurada" from "IH em baixo", flags
 * stale readings, and names the WMO/Copernicus fallback state («WMO em baixo»)
 * when the cross-border fallback also has no fresh data. Renders nothing when
 * either source is healthy (IH or WMO fresh) or the spot already shows a
 * fresh buoy reading (parent gates on that).
 *
 * `scope` adapts the copy: 'spot' (default) talks about "this page", 'home'
 * about "the map and cards" — the homepage has no single spot to point at.
 */
export default function BuoyLayerNotice({
  locale,
  scope = 'spot',
  overlay = false,
}: {
  locale: string;
  scope?: 'spot' | 'home';
  /** Over a map/image: give the card a solid backdrop + blur for readability. */
  overlay?: boolean;
}) {
  const isPt = locale === 'pt';
  const isHome = scope === 'home';
  const [status, setStatus] = useState<BuoyLayerStatus | null>(null);
  const [wmo, setWmo] = useState<WmoLayerStatus>('down');

  useEffect(() => {
    let cancelled = false;
    loadBuoyLayerHealth()
      .then((h) => {
        if (!cancelled) {
          setStatus(h.status);
          setWmo(h.wmo);
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('no-key');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // O aviso só aparece quando NENHUMA fonte tem leituras frescas (se o WMO
  // cobre, o ObservedWaveCard renderiza e não há nada a avisar).
  if (!status) return null;

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

  return (
    <div
      role="status"
      className={cn(
        'rounded-card border p-3 flex items-start gap-2.5 text-meta-sm',
        status === 'no-key'
          ? 'border-score-fair/40 text-fg'
          : 'border-score-poor/40 text-fg',
        overlay
          ? 'bg-bg-elevated/95 backdrop-blur-sm shadow-card'
          : status === 'no-key'
            ? 'bg-score-fair/10'
            : 'bg-score-poor/10',
      )}
    >
      <AlertTriangle
        className={cn(
          'w-4 h-4 mt-0.5 shrink-0',
          status === 'no-key' ? 'text-score-fair' : 'text-score-poor',
        )}
        aria-hidden
      />
      <p className="leading-snug">
        <strong className="font-semibold">{c.title}: </strong>
        {c.body}
        {wmoNote}
      </p>
    </div>
  );
}
