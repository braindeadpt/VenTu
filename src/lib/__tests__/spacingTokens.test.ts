import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guarda de divergência dos tokens de layout da página de spot.
 *
 * A cota de pinagem (`--ventu-spot-sticky-top`, header h-16) e a altura da
 * fila de sport tabs (`--ventu-spot-tabs-h`) vivem UMA vez no globals.css e
 * são referenciadas por nome nas âncoras/scroll-margin do CSS. Se alguém
 * voltar a hard-codar a cota ou deixar de usar a variável, o CI falha — os
 * sítios nunca divergem.
 * (A SpotStickyBar legada saiu na limpeza SP-D e a SpotUnifiedBar na #464;
 * os consumidores vivos são as âncoras de globals.css e o reset v6.)
 */
const ROOT = join(__dirname, '..', '..', '..');

const globalsCss = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf-8');
// O reset v6 zera as duas cotas na rota /mapa — o e2e spot-sticky-geometry
// mede-as a 0 e depende desta linha.
const atlanticoCss = readFileSync(join(ROOT, 'src/styles/v6-atlantico.css'), 'utf-8');

describe('tokens de layout sport tabs', () => {
  it('globals.css define os dois tokens com os valores esperados', () => {
    expect(globalsCss).toMatch(/--ventu-spot-sticky-top:\s*64px/);
    expect(globalsCss).toMatch(/--ventu-spot-tabs-h:\s*48px/);
  });

  it('as âncoras usam os tokens na cota de scroll-margin e o v6 faz reset a 0', () => {
    expect(globalsCss).toMatch(
      /scroll-margin-top:\s*calc\(var\(--ventu-spot-sticky-top\)\s*\+\s*var\(--ventu-spot-tabs-h\)/,
    );
    expect(atlanticoCss).toMatch(/--ventu-spot-sticky-top:\s*0px/);
    expect(atlanticoCss).toMatch(/--ventu-spot-tabs-h:\s*0px/);
  });

  it('as alturas ficam coerentes: 44px tab + pb-1 (4px) = 48px do token', () => {
    // O token documenta a cadeia; se o min-h do tab mudar sem bump, o teste
    // abaixo sinaliza (44 + 4 continua a caber no slot de 48px).
    const sportTab = readFileSync(join(ROOT, 'src/components/spots/SportTab.tsx'), 'utf-8');
    expect(sportTab).toMatch(/min-h-\[44px\]/);
    expect(globalsCss).toMatch(/--ventu-spot-tabs-h:\s*48px/);
  });
});