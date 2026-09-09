import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Contrato de empilhamento do /mapa — a regra que impede o popover do chip
 * de boias de ficar sob a coluna de controlos.
 *
 * HISTÓRIA (flake CI 34374292405): o popover abria com `right-0` sobre um
 * wrapper de 44px (offscreen em mobile, x=-255 num ecrã de 390px) e, no
 * desktop, o botão «Dispensar este aviso» ficava sob a coluna MapControls
 * — renderizado mas inacessível, com o clique a estoirar no timeout de 60s
 * (o teste repetiu 3× com o mesmo erro). O fix (a6a6e45cf) trocou a âncora
 * para `left-0 bottom-full` e subiu o z para 1250.
 *
 * VERDADE DE EMPILHAMENTO: o z-[1250] do popover NÃO vence a coluna. O
 * popover vive dentro do MapExploreHud (z-[1100]), que cria um stacking
 * context — o 1250 é local ao HUD, e o contexto global do HUD (1100) perde
 * para a coluna (1200). O que protege o dismiss é a GEOMETRIA: a âncora
 * left-0 abre o popover à direita do chip, que está à direita da coluna
 * (desviada para left-[68px] pelo fix do zoom). Se alguém mudar a âncora,
 * mover o chip para a esquerda ou subir a coluna, o dismiss volta a ficar
 * coberto em silêncio — estes pins apanham-no no build (padrão
 * spacingTokens / hydrationGates).
 */
const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

const chip = read('src/components/spots/BuoyLayerChip.tsx');
const controls = read('src/components/spots/map/components/MapControls.tsx');
const hud = read('src/components/spots/MapExploreHud.tsx');

describe('map stacking contract (chip popover vs controls column)', () => {
  it('o popover ancora `left-0 bottom-full` — nunca `right-0` (o bug offscreen)', () => {
    expect(chip).toContain('data-buoy-chip-popover="true"');
    // A âncora vive no className do próprio popover, logo a seguir ao atributo.
    expect(chip).toMatch(/data-buoy-chip-popover="true"[^>]*\bbottom-full left-0\b/);
    expect(chip).not.toMatch(/data-buoy-chip-popover="true"[^>]*\bright-0\b/);
  });

  it('a coluna de controlos mantém z-[1200] e o desvio left-[68px] (fora do zoom e da região do chip)', () => {
    expect(controls).toMatch(/z-\[1200\]/);
    expect(controls).toMatch(/left-\[68px\]/);
  });

  it('o HUD fica em z-[1100] abaixo da coluna — o dismiss depende de geometria, não de z', () => {
    expect(hud).toMatch(/z-\[1100\]/);
    expect(chip).toMatch(/z-\[1250\]/);
  });
});