/**
 * Web Worker para construir a geografia vectorial da praia (`construirGeo`)
 * fora da main thread nos spots sem ficheiro estático.
 * Recebe as duas grades de tiles Terrarium já descodificadas e devolve
 * `GeoPraia` transferindo os buffers Float32Array de `ondas`.
 */
import { amostradorDeGrade, construirGeo, type GradeTiles, type OpcoesGeo } from '@/lib/praiaGeo';

export interface PedidoGeoWorker {
  id: number;
  ll: [number, number];
  o: OpcoesGeo;
  fino: GradeTiles;
  largo: GradeTiles | null;
}

self.onmessage = (ev: MessageEvent<PedidoGeoWorker>) => {
  const { id, ll, o, fino, largo } = ev.data;
  try {
    const geo = construirGeo(ll, o, amostradorDeGrade(fino), largo ? amostradorDeGrade(largo) : null);
    const { prof, dist, ...ondasResto } = geo.ondas;
    const msg = { id, ok: true as const, geo: { ...geo, ondas: { ...ondasResto, prof, dist } } };
    (self as unknown as Worker).postMessage(msg, [prof.buffer, dist.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false as const, erro: err instanceof Error ? err.message : String(err) });
  }
};
