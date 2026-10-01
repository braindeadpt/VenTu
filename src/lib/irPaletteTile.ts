/** Ponte DOM para a LUT Infra+ ([`irPalette.ts`](../irPalette.ts)): corre no
 *  `tileload`, DEPOIS da máscara GIBS. Lê o tile mascarado (o `src` já é
 *  data-URL quando houve máscara), aplica a paleta aos pixels da banda fria
 *  e reescreve o `src`.
 *
 *  Guard de idempotência: lê/escreve a MESMA flag `ventuMasked`/`ventuTinted`
 *  do pipeline — a paleta nunca corre duas vezes sobre o mesmo tile (as
 *  cores da paleta têm brilhos que cairiam de novo na banda e tingiriam em
 *  cascata). Se o tile não suportar dataset (fake de teste), falha fechada.
 *
 *  Porquê DOM e não canvas partilhado do gibsSatellite: o tile já chegou
 *  mascarado e o custo é o mesmo (drawImage + getImageData + putImageData +
 *  toDataURL ~1-2 ms por tile); a separação mantém o módulo da paleta puro
 *  e o módulo GIBS sem dependência da paleta. */
import { applyIrPalette } from './irPalette';

const TILE_TINTED_FLAG = 'ventuTinted';

export function irApplyPaletteToTile(img: HTMLImageElement): boolean {
  try {
    if (img.dataset[TILE_TINTED_FLAG]) return false;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return false;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h);
    const colored = applyIrPalette(imageData.data);
    if (colored === 0) {
      img.dataset[TILE_TINTED_FLAG] = '1';
      return false;
    }
    ctx.putImageData(imageData, 0, 0);
    img.src = canvas.toDataURL('image/png');
    img.dataset[TILE_TINTED_FLAG] = '1';
    return true;
  } catch {
    return false;
  }
}
