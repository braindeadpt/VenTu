'use client';

/**
 * Porque é que não há onda observada (v6): a camada de boias IH sem chave,
 * em baixo ou com leituras antigas, e o fallback WMO (Copernicus) idem.
 * O estado vem do mesmo hook do BuoyLayerNotice (ih-buoys.json +
 * wmo-buoys.json); só aparece quando NENHUMA das fontes está fresca, e a
 * dispensa fica guardada pelo mesmo motivo.
 */
import { AlertTriangle, Info, X } from 'lucide-react';
import { getTranslation } from '@/lib/i18n';
import { buoyLayerCopy, useBuoyLayerNotice } from '@/lib/buoyLayerNotice';

export default function BoiaAvisoCamadaV6({ locale }: { locale: string }) {
  const { status, wmo, dismissed, dismiss } = useBuoyLayerNotice();
  if (!status || dismissed?.reason === status) return null;
  const c = buoyLayerCopy(status, wmo, locale, false);
  const Glifo = status === 'down' ? AlertTriangle : Info;
  return (
    <div className="ec-camada" data-buoy-layer={status}>
      <Glifo aria-hidden="true" />
      <p role="status">
        <strong>{c.title}: </strong>
        {c.body}
        {c.wmoNote}
      </p>
      <button type="button" aria-label={getTranslation(locale).spotsMap.dismissBuoyNotice} onClick={dismiss} data-buoy-notice-dismiss="true">
        <X aria-hidden="true" />
      </button>
    </div>
  );
}
