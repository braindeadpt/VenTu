/** EUMETSAT MTG-I1 — FCI servido pela nossa pipeline
 *  (scripts/fetch-mtg-ir.py → public/data/sat-mtg.json + frames WebP).
 *
 *  Dois produtos por slot, escolhidos na pipeline por elevação solar:
 *  'vis' = natural-color opaco (de dia — a foto «bonita»), 'ir' = IR
 *  10.5 µm colorizado com paleta de topo de nuvem translúcida (de
 *  noite — radiância → Planck → BT em K). O frontend só pinta o ficheiro
 *  indicado no manifest.
 *
 *  A diferença face ao GOES-IR/GIBS: o Meteosat Third Generation está a
 *  0° sobre o Atlântico — Ibéria, Açores e Madeira ficam a resolução quase
 *  nativa (~2 km) em vez do limbo oriental do disco GOES-East. Os frames
 *  chegam georreferenciados numa bbox fixa EPSG:4326 — no mapa são
 *  L.imageOverlay, não tile pyramid.
 *
 *  Licença: dados «Core» (latência ≥ 1 h) são CC-BY-4.0; a pipeline corre
 *  de hora em hora, por isso os frames servidos têm tipicamente essa
 *  idade. Ver docs/EXTERNAL-DATA.md. */

export const MTG_SAT_MANIFEST_URL = '/data/sat-mtg.json';
/** Idade do frame mais recente a partir da qual o badge mostra
 *  «atrasado» — a pipeline corre ~1/h, 3 h de silêncio = problema. */
export const MTG_SAT_STALE_MAX_AGE_MIN = 180;
export const MTG_SAT_CADENCE_MIN = 10;
/** Opacidade dos imageOverlays — a paleta já leva alpha próprio (o
 *  pixel quente do oceano é translúcido), aqui fica a compensação
 *  global equivalente aos 0.85 do GOES-IR. */
export const MTG_SAT_OPACITY = 1.0;

export const MTG_SAT_ATTRIBUTION =
  'Imagery © <a href="https://www.eumetsat.int">EUMETSAT</a> (Meteosat MTG-I1 FCI)';

export interface MtgSatFrame {
  /** URL servida pelo nosso origin (`/data/sat-mtg/frames/{vis,ir}-…webp`). */
  url: string;
  /** Slot de sensing do satélite (UTC, ISO com Z). */
  frameTime: string;
}

export interface MtgSatManifest {
  source: string;
  fetchedAt: string;
  cadenceMin: number;
  bounds: { south: number; west: number; north: number; east: number };
  attribution: string;
  /** kind: 'ir' = paleta topo-de-nuvem translúcida; 'vis' = foto
   *  natural-color opaca (slots de dia — a pipeline escolhe por elevação
   *  solar, o frontend só pinta o PNG indicado). */
  frames: Array<{ frameTime: string; imagePath: string; kind?: 'ir' | 'vis' }>;
}

/** Lê o manifest; devolve null se o fetch falhar ou o schema não servir
 *  (o caller mantém o GOES-IR/GIBS como fallback). */
export async function fetchMtgSatManifest(
  fetchImpl: typeof fetch = fetch,
): Promise<MtgSatManifest | null> {
  try {
    const res = await fetchImpl(`${MTG_SAT_MANIFEST_URL}?v=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as MtgSatManifest;
    if (
      !data ||
      !Array.isArray(data.frames) ||
      data.frames.length === 0 ||
      !data.bounds
    ) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/** Manifest → frames do carrossel (mais recente primeiro, como o GOES). */
export function mtgSatFrames(manifest: MtgSatManifest): MtgSatFrame[] {
  return manifest.frames.map((f) => ({
    url: `/data/${f.imagePath}`,
    frameTime: f.frameTime,
  }));
}

/** Bounds do manifest → [[S, W], [N, E]] para L.imageOverlay. */
export function mtgSatBounds(
  manifest: MtgSatManifest,
): [[number, number], [number, number]] {
  const b = manifest.bounds;
  return [
    [b.south, b.west],
    [b.north, b.east],
  ];
}

/** Manifest utilizável = frame mais recente dentro do limiar de
 *  staleness (a pipeline morrida não deve apresentar nuvens de ontem
 *  como «agora» — o caller cai para o fallback GIBS). */
export function mtgSatIsFresh(
  manifest: MtgSatManifest,
  nowMs: number = Date.now(),
): boolean {
  const newest = Date.parse(manifest.frames[0]?.frameTime ?? '');
  if (!Number.isFinite(newest)) return false;
  return nowMs - newest <= MTG_SAT_STALE_MAX_AGE_MIN * 60_000;
}
