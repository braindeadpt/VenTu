import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guarda de divergência dos tokens de layout da página de spot.
 *
 * A cota de pinagem (`--ventu-spot-sticky-top`, header h-16) e a altura da
 * fila de sport tabs (`--ventu-spot-tabs-h`) vivem UMA vez no globals.css e
 * são referenciadas por nome na SpotUnifiedBar e nas âncoras/scroll-margin
 * do CSS. Se alguém voltar a hard-codar `top: '64px'` / `top-16` ou deixar
 * de usar a variável, o CI falha — os sítios nunca divergem.
 * (A SpotStickyBar legada saiu na limpeza SP-D; a barra unificada é a única
 * superfície sticky.)
 */
const ROOT = join(__dirname, '..', '..', '..');

const globalsCss = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf-8');
// A fila de tabs vive na barra unificada — partilha a cota de pinagem e a
// altura de 48px com as âncoras calculadas em globals.css.
const detail = readFileSync(
  join(ROOT, 'src/components/spots/verdict/SpotUnifiedBar.tsx'),
  'utf-8',
);

describe('tokens de layout sport tabs (SpotUnifiedBar)', () => {
  it('globals.css define os dois tokens com os valores esperados', () => {
    expect(globalsCss).toMatch(/--ventu-spot-sticky-top:\s*64px/);
    expect(globalsCss).toMatch(/--ventu-spot-tabs-h:\s*48px/);
  });

  it('a barra unificada usa os tokens (pin top + altura da fila) e não hard-coda top-16', () => {
    expect(detail).toContain("top: 'var(--ventu-spot-sticky-top)'");
    expect(detail).toContain("height: 'var(--ventu-spot-tabs-h)'");
    expect(detail).not.toMatch(/sticky\s+top-16\b/);
  });

  it('as alturas ficam coerentes: 44px tab + pb-1 (4px) = 48px do token', () => {
    // O token documenta a cadeia; se o min-h do tab mudar sem bump, o teste
    // abaixo sinaliza (44 + 4 continua a caber no slot de 48px).
    const sportTab = readFileSync(join(ROOT, 'src/components/spots/SportTab.tsx'), 'utf-8');
    expect(sportTab).toMatch(/min-h-\[44px\]/);
    expect(globalsCss).toMatch(/--ventu-spot-tabs-h:\s*48px/);
  });
});