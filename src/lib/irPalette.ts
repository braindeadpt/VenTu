/** Realce de IR «Infra+» (estilo Windy/EUMETSAT): paleta de temperaturas
 *  para topos de nuvens frios no canal IR.
 *
 *  A paleta segue a convenção meteorológica (ver
 *  https://cwg.eumetsat.int/color-enhancements/): o brilho do pixel IR é
 *  inverso à temperatura do topo (pixel claro = topo frio = célula de
 *  tempestade). Mapeamos a banda útil de topos de nuvens — ~200 K (células
 *  convectivas severas) a ~280 K (céu limpo húmido) — para cores
 *  perceptualmente óbvias: azul (frio moderado) → ciano → verde → amarelo
 *  → vermelho/magenta (topos mais severos). Pixels quentes (solo/mar) ficam
 *  na escala cinzenta original — só a nuvem relevante ganha cor.
 *
 *  Corre no MESMO pipeline do tile (gibsAttachTileMask → tileload): é uma
 *  LUT 256×3 aplicada aos pixels já mascarados, custo ~1 ms por tile, e é
 *  IDEMPOTENTE por construção — operamos sobre o canal Y (brilho) lido uma
 *  única vez, e a flag `dataset.ventuMasked` do tile garante que corre uma
 *  só vez por tile (mesmo guard do loop do GIBS). */

/** Banda de temperatura de interesse em brilho 0–255. O IR10.8 do
 *  EUMETView (style «raster») e o GOES Band13 Clean IR são grayscale com o
 *  frio claro: mapeamos brilho ≥ BRILHO_FRIO_MIN (≈ topos < ~240 K) para
 *  cor; o resto (mar/solo/nuvens baixas) fica inalterado. */
export const IR_BRIGHT_COLD_MIN = 150; // ≈ 240 K no estilo raster EUMETSAT
export const IR_BRIGHT_COLD_MAX = 255; // ≈ 200 K / saturação do topo

/** Âncoras de cor (r,g,b) de frio extremo → frio moderado. Interpolação
 *  linear entre âncoras; index = normalização do brilho na banda fria. */
const PALETTE_STOPS: ReadonlyArray<readonly [number, number, number, number]> = [
  // [pos 0..1, r, g, b] — pos 1 = topo mais frio/severo
  [0.0, 40, 60, 220], // azul profundo — topo moderado (~240 K)
  [0.25, 0, 180, 230], // ciano
  [0.5, 40, 210, 120], // verde
  [0.75, 250, 210, 60], // amarelo
  [1.0, 245, 40, 90], // vermelho/magenta — célula severa (~200 K)
];

/** LUT 256 entradas × 3 canais. Só os índices da banda fria têm cor; o
 *  resto é null = pixel intacto. Construída uma vez (módulo, lazy). */
let lut: Array<[number, number, number] | null> | null = null;

function getLut(): Array<[number, number, number] | null> {
  if (lut) return lut;
  lut = new Array(256).fill(null);
  const span = IR_BRIGHT_COLD_MAX - IR_BRIGHT_COLD_MIN;
  for (let b = IR_BRIGHT_COLD_MIN; b <= IR_BRIGHT_COLD_MAX; b += 1) {
    const t = (b - IR_BRIGHT_COLD_MIN) / span; // 0 = moderado, 1 = severo
    let i = 0;
    while (i < PALETTE_STOPS.length - 2 && t > PALETTE_STOPS[i + 1][0]) i += 1;
    const [p0, r0, g0, b0] = PALETTE_STOPS[i];
    const [p1, r1, g1, b1] = PALETTE_STOPS[i + 1];
    const f = p1 === p0 ? 0 : (t - p0) / (p1 - p0);
    lut[b] = [
      Math.round(r0 + (r1 - r0) * f),
      Math.round(g0 + (g1 - g0) * f),
      Math.round(b0 + (b1 - b0) * f),
    ];
  }
  return lut;
}

/** Aplica a paleta Infra+ a um buffer RGBA IN-PLACE. Só os pixels cujo
 *  brilho (max canal) está na banda fria são coloridos — chão/mar intactos,
 *  alpha intacto (a máscara já correu antes). Devolve quantos pixels foram
 *  coloridos (para testes e contagem de cobertura).
 *
 *  Idempotência: chamada 2× sobre o MESMO buffer não muda nada (as cores da
 *  paleta têm brilho ≤ IR_BRIGHT_COLD_MIN? NÃO — por isso é vital o guard
 *  `dataset.ventuMasked` no tile; esta função NÃO é idempotente em buffer
 *  arbitrário e nunca deve correr sem o guard do tileload). */
export function applyIrPalette(data: Uint8ClampedArray): number {
  const table = getLut();
  let colored = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] === 0) continue; // transparente (sem dados) — intacto
    const b = Math.max(data[i], data[i + 1], data[i + 2]);
    const rgb = table[b];
    if (!rgb) continue;
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    colored += 1;
  }
  return colored;
}

/** Variante para testes: devolve a cor da paleta para um brilho 0–255 (ou
 *  null se fora da banda fria). */
export function irPaletteColorFor(bright: number): [number, number, number] | null {
  return getLut()[Math.max(0, Math.min(255, Math.floor(bright)))] ?? null;
}
