import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guarda do padrão «hydration gate» (zero placeholder flash).
 *
 * Componentes cujo estado só existe depois do mount (coração de favoritos,
 * check-in, slots do Dawn Patrol, arquivo de notícias) renderizam markup
 * real no SSR e ficam escondidos por CSS até o HydrationBeacon pôr a classe
 * `is-hydrated` no <html> — o mesmo mecanismo class-driven dos ícones do
 * ThemeToggle. Se alguém partir a cadeia (classe no beacon, regra no CSS,
 * atributo/página no componente), o flash de placeholder volta sem nenhum
 * teste e2e dar por isso — por isso estes contratos vivem aqui.
 */
const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

const beacon = read('src/components/HydrationBeacon.tsx');
const css = read('src/app/globals.css');
const favoriteButton = read('src/components/FavoriteButton.tsx');
const checkInButton = read('src/components/CheckInButton.tsx');
const dawnSlots = read('src/components/homepage/HomeDawnPatrolSlots.tsx');
const news = read('src/components/news/NewsArchiveClient.tsx');

describe('hydration gate (zero placeholder flash)', () => {
  it('HydrationBeacon carimba a classe is-hydrated no <html>', () => {
    expect(beacon).toContain("classList.add('is-hydrated')");
  });

  it('globals.css esconde cada gate antes da hidratação com especificidade à prova de utilitários', () => {
    // html:not(...) vence qualquer classe utilitária do Tailwind no mesmo
    // elemento, independentemente da ordem das folhas de estilo.
    expect(css).toMatch(/html:not\(\.is-hydrated\)\s+\[data-hydration-gate='heart'\]/);
    expect(css).toMatch(/html:not\(\.is-hydrated\)\s+\[data-hydration-gate='news'\]/);
    expect(css).toMatch(/html:not\(\.is-hydrated\)\s+\.hydration-dawn-slot/);
  });

  it('FavoriteButton e CheckInButton SSRam o botão real com a gate de coração e sem placeholder', () => {
    for (const src of [favoriteButton, checkInButton]) {
      expect(src).toContain('data-hydration-gate="heart"');
      // O regresso a um placeholder pulsado antes do mount é o bug exato
      // que este padrão elimina.
      expect(src).not.toMatch(/animate-pulse/);
      expect(src).not.toMatch(/return null/);
    }
  });

  it('os slots do Dawn Patrol usam a gate de slot em vez de retornar null antes do mount', () => {
    expect(dawnSlots).toContain('hydration-dawn-slot');
    // A decisão da janela matinal ainda é tomada no mount — o que não pode
    // voltar é o `isMorning === null || ...` que trocava markup por vazio.
    expect(dawnSlots).not.toContain('isMorning === null');
  });

  it('o arquivo de notícias SSRa o shell real (gate news) sem spin de placeholder', () => {
    expect(news).toContain('data-hydration-gate="news"');
    expect(news).not.toContain('animate-spin');
  });
});
