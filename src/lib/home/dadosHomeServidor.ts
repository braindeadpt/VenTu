/**
 * Dados da home v6 (#183), parte do servidor (SSG): corta as linhas do
 * forecast dos spots da costa e calcula o que o cliente precisa de cada spot
 * (praia do motor, série, fotos). Ver `dadosHome.ts`.
 */
import type { LinhaForecast } from '@/lib/horaSpot';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';
import { spots as TODOS } from '@/lib/spots';
import { fotoDoSpot, type FotoSpot } from '@/lib/spotFotos';
import type { Modalidade } from '@/lib/modalidades';
import { COSTA_V6 } from './homeV6';
import { compactarCosta, type CostaCompacta, type MetaCosta } from './dadosHome';

/** id da série do forecast de um spot (a mesma regra do loader da página de spot). */
export function serieDe(id: string): string {
  const s = TODOS.find((x) => x.id === id);
  return s?.conditionsSource ?? id;
}

/**
 * Horas da costa em colunas para o HTML (3 dias desde as 00h do build), feitas
 * com `horaDeLinha` sobre as séries inteiras do forecast — as linhas que a
 * página de spot lê.
 */
export function costaCompacta(forecasts: Record<string, ReadonlyArray<Record<string, unknown>>>, agoraMs: number, dias = 3): CostaCompacta {
  const meta = metaCosta();
  const linhas: Record<string, LinhaForecast[]> = {};
  for (const id of Object.keys(meta)) linhas[id] = (forecasts[meta[id].serie] ?? forecasts[id] ?? []) as unknown as LinhaForecast[];
  return compactarCosta(linhas, agoraMs, meta, dias);
}

/** Praia, série e posição de cada spot da costa (o mesmo `editorialDe` da página de spot). */
export function metaCosta(): MetaCosta {
  const out: MetaCosta = {};
  for (const c of COSTA_V6.spots) {
    const s = TODOS.find((x) => x.id === c.id);
    if (!s) continue;
    const ed = editorialDe(s);
    out[c.id] = { slug: s.slug, serie: serieDe(c.id), lat: s.lat, lon: s.lon, praiaVirada: ed.praiaVirada, sp: spotModalidadeDe(ed) };
  }
  return out;
}

export type FotosCosta = Record<string, Record<Modalidade, FotoSpot | null>>;

/**
 * Só os campos que a home lê (imagem, enquadramento, crédito e o alt da língua da
 * página): o resto da ficha da foto (ficheiro, licUrl, local, o alt da outra língua)
 * ficava no HTML e nos dois payloads RSC sem uso.
 */
function fotoHome(f: FotoSpot | null, locale: string): FotoSpot | null {
  if (!f) return null;
  const { ficheiro: _a, card: _b, licUrl: _c, local: _d, altPt, altEn, ...resto } = f as FotoSpot & Record<string, unknown>;
  return { ...resto, ...(locale === 'pt' ? { altPt } : { altEn }) } as unknown as FotoSpot;
}

/** Foto de cada spot da costa por modalidade (a mesma regra da página de spot). */
export function fotosCosta(locale = 'pt'): FotosCosta {
  const out: FotosCosta = {};
  for (const c of COSTA_V6.spots) {
    const s = TODOS.find((x) => x.id === c.id);
    if (!s) continue;
    out[c.id] = { kite: fotoHome(fotoDoSpot(s, 'kite'), locale), surf: fotoHome(fotoDoSpot(s, 'surf'), locale) };
  }
  return out;
}
