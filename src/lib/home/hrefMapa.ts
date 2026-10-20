/**
 * Ligação da home para o /mapa (#273, v7 «Porta do mapa», fase A). Puro e testável.
 *
 * Contrato do URL: `/{locale}/mapa/?sport=&wind=1&t=&dia=&lat=&lon=&z=&spot=&de=home`
 *  - `sport`: `kitesurf` (Kite) ou `surf` (Surf), conforme a modalidade da home;
 *  - `wind=1` no desktop; no telemóvel só com `ventoMovel` (gate do Lighthouse, ver
 *    `VENTO_MOVEL`), senão não vai (o /mapa mobile arranca sem vento, como hoje);
 *  - `t`: hora local (0–23) da hora mostrada no mapa da home (`E.horaMapa`);
 *  - `dia=1` quando essa hora é amanhã (o /mapa escolhe a frame de hoje+dia); omitido hoje;
 *  - câmara da maquete: `lat=39.35&lon=-8.95`, `z=7` (desktop) / `6.5` (telemóvel);
 *  - `spot`: só nos rótulos dos spots (abre o detalhe no /mapa com `de=home`);
 *  - `de=home`.
 */
import type { Modalidade } from '@/lib/modalidades';

/**
 * Gate do vento no telemóvel (decisão 3 da maquete v7): o /mapa mobile com `wind=1`
 * mediu dentro dos orçamentos actuais do Lighthouse (mediana de 5; números no PR #273)?
 */
export const VENTO_MOVEL = true;

export const CAMARA_MAPA = { lat: 39.35, lon: -8.95, zDesk: 7, zMovel: 6.5 } as const;

const SPORT: Record<Modalidade, string> = { kite: 'kitesurf', surf: 'surf' };

export interface HrefMapaOpcoes {
  locale: string;
  d: Modalidade;
  /** `M.t(E.horaMapa)`: hora de parede de Lisboa da hora mostrada («YYYY-MM-DDTHH:…») */
  tMapa: string;
  /** `M.t(E.agoraI)`: a hora de agora (o dia de «hoje» da home) */
  tAgora: string;
  /** largura ≥ 1024 px */
  desk: boolean;
  ventoMovel?: boolean;
  spot?: string;
}

const diaUTC = (t: string) => {
  const [y, m, d] = t.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

export function hrefMapa({ locale, d, tMapa, tAgora, desk, ventoMovel = VENTO_MOVEL, spot }: HrefMapaOpcoes): string {
  const p = new URLSearchParams();
  p.set('sport', SPORT[d]);
  if (desk || ventoMovel) p.set('wind', '1');
  const hora = Number(tMapa.slice(11, 13));
  if (Number.isFinite(hora)) p.set('t', String(hora));
  const dia = Math.round(diaUTC(tMapa) - diaUTC(tAgora));
  if (Number.isFinite(hora) && dia >= 1) p.set('dia', '1');
  p.set('lat', String(CAMARA_MAPA.lat));
  p.set('lon', String(CAMARA_MAPA.lon));
  p.set('z', String(desk ? CAMARA_MAPA.zDesk : CAMARA_MAPA.zMovel));
  if (spot) p.set('spot', spot);
  p.set('de', 'home');
  return `/${locale}/mapa/?${p.toString()}`;
}
