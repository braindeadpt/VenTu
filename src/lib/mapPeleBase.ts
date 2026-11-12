/**
 * Pele v6 do /mapa, PR B6 (decisão D1, aprovada a 01/11): o recolor da base «Mapa».
 *
 * Um filtro SVG `feComponentTransfer` (tabela de 52 pontos por canal) passa os
 * cinzentos do Esri World Dark Gray Base à paleta v6: o mar (cinzento ~35) a
 * `#0E3A5E`, a terra (cinzento ~71) a ardósia, as linhas a névoa. É o mesmo filtro
 * da maquete da fase B (`_build/filtro.py`), gerado aqui a partir dos mesmos seis
 * pontos. Corre na rasterização dos mosaicos (fora da main thread). Nunca se
 * aplica ao Satélite.
 */
export const V6_BASE_FILTER_ID = 'v6base';

/** Pontos da rampa: luminância de entrada (0–1) → cor v6 (RGB 0–255). */
export const V6_BASE_STOPS: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [0, [3, 14, 24]], // abismo
  [0.133, [14, 58, 94]], // mar (o cinzento do mar do Dark Gray)
  [0.19, [16, 40, 58]],
  [0.255, [17, 28, 40]], // terra
  [0.4, [70, 98, 122]],
  [1, [169, 194, 212]], // névoa
];

export const V6_BASE_TABLE_SIZE = 52;

function interp(x: number, ch: 0 | 1 | 2): number {
  for (let i = 0; i < V6_BASE_STOPS.length - 1; i++) {
    const [a, ca] = V6_BASE_STOPS[i];
    const [b, cb] = V6_BASE_STOPS[i + 1];
    if (x >= a && x <= b) return (ca[ch] + ((cb[ch] - ca[ch]) * (x - a)) / (b - a)) / 255;
  }
  return V6_BASE_STOPS[V6_BASE_STOPS.length - 1][1][ch] / 255;
}

/** `tableValues` de um canal (0 = R, 1 = G, 2 = B), com 4 casas como na maquete. */
export function v6BaseTable(ch: 0 | 1 | 2): string {
  const out: string[] = [];
  for (let i = 0; i < V6_BASE_TABLE_SIZE; i++) out.push(interp(i / (V6_BASE_TABLE_SIZE - 1), ch).toFixed(4));
  return out.join(' ');
}

/** Cor (0–255) que o filtro dá a um cinzento de entrada (0–255): a tabela com interpolação linear, como o SVG. */
export function v6BaseApply(gray: number): [number, number, number] {
  const n = V6_BASE_TABLE_SIZE - 1;
  const x = Math.min(1, Math.max(0, gray / 255)) * n;
  const k = Math.min(n - 1, Math.floor(x));
  const f = x - k;
  return ([0, 1, 2] as const).map((ch) => {
    const v = v6BaseTable(ch).split(' ').map(Number);
    return Math.round((v[k] + (v[k + 1] - v[k]) * f) * 255);
  }) as [number, number, number];
}
