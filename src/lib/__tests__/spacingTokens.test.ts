import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guarda de divergência dos tokens de layout da página de spot.
 *
 * A cota de pinagem (`--ventu-spot-sticky-top`, header h-16) e a altura da
 * fila de sport tabs (`--ventu-spot-tabs-h`) vivem UMA vez no globals.css e
 * são referenciadas por nome nas duas superfícies (secção sticky + barra).
 * Se alguém voltar a hard-codar `top: '64px'` / `top-16` ou um dos lados
 * deixar de usar a variável, o CI falha — os dois sítios nunca divergem.
 */
const ROOT = join(__dirname, '..', '..', '..');

const globalsCss = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf-8');
const stickyBar = readFileSync(join(ROOT, 'src/components/spots/SpotStickyBar.tsx'), 'utf-8');
const detail = readFileSync(join(ROOT, 'src/components/spots/SpotDetailClient.tsx'), 'utf-8');

describe('tokens de layout sport tabs (secção sticky vs SpotStickyBar)', () => {
  it('globals.css define os dois tokens com os valores esperados', () => {
    expect(globalsCss).toMatch(/--ventu-spot-sticky-top:\s*64px/);
    expect(globalsCss).toMatch(/--ventu-spot-tabs-h:\s*48px/);
  });

  it('a SpotStickyBar usa os tokens (top da barra + altura da fila) e não hard-coda 64px', () => {
    expect(stickyBar).toContain("top: 'var(--ventu-spot-sticky-top)'");
    expect(stickyBar).toContain("height: 'var(--ventu-spot-tabs-h)'");
    // Divergência guard: qualquer regresso a âncora mágica falha aqui.
    expect(stickyBar).not.toMatch(/top:\s*'64px'|top:\s*"64px"/);
  });

  it('a secção sticky usa os tokens (pin top + altura da fila) e não hard-coda top-16', () => {
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