import { useEffect, useState } from 'react';
import type L from 'leaflet';

/**
 * Espelha o innerHTML do controlo de atribuição do Leaflet.
 *
 * No mobile fullscreen o controlo real fica tapado pelo bottom sheet — a
 * linha de créditos renderiza-se dentro do sheet a partir deste HTML, para
 * que OSM/CARTO/Open-Meteo/créditos de camadas continuem sempre visíveis
 * (obrigação de licença). Única fonte: o próprio controlo — o observer
 * apanha todas as mudanças de camadas sem duplicar a lógica.
 */
export function useMapAttribution(
  mapInstanceRef: React.MutableRefObject<L.Map | null>,
  isReady: boolean,
): string {
  const [html, setHtml] = useState('');
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!isReady || !map) return;
    const el = map.attributionControl?.getContainer();
    if (!el) return;
    const sync = () => setHtml(el.innerHTML);
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, [isReady, mapInstanceRef]);
  return html;
}
