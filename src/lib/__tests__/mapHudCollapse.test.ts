import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Contrato do colapso do HUD (MapExploreHud) — decisão 2026-09-10.
 *
 * O HUD é a superfície mais cara do mapa (sonda
 * scripts/audit/audit-hud-footprint.mjs: 30–43% do viewport no desktop).
 * Três invariantes prendem o comportamento:
 *
 *  1. O HUD começa SEMPRE colapsado (SSR e primeiro paint do cliente são
 *     iguais; hidratação estável — padrão hydrationGates).
 *  2. O container de filtros usa a MESMA classe em ambas as superfícies:
 *     colapsado = 'hidden' em TODAS (incl. md+), expandido = 'flex'. Um
 *     revert para o antigo 'hidden md:flex' (desktop sempre expandido) falha
 *     aqui.
 *  3. O auto re-expand em mudanças de filtro com o HUD colapsado foi
 *     avaliado e rejeitado (nenhum controlo altera filtros in-place com as
 *     rows escondidas) — a decisão fica documentada no componente.
 *     O contador no aria-label do toggle mostra o nº de filtros activos.
 */
const ROOT = join(__dirname, '..', '..', '..');
const hud = readFileSync(join(ROOT, 'src/components/spots/MapExploreHud.tsx'), 'utf-8');

describe('mapHudCollapse (contrato do colapso do HUD)', () => {
  it('começa sempre colapsado (useState(true))', () => {
    expect(hud).toContain('useState(true)');
  });

  it('rows de filtro escondidas em TODAS as superfícies quando colapsado (hidden md:hidden)', () => {
    expect(hud).toContain("'hidden md:hidden'");
    // E já não existe o estado antigo "desktop sempre expandido".
    expect(hud).not.toContain("'hidden md:flex'");
  });

  it('toggle de desktop mostra o contador de filtros activos (no aria-label)', () => {
    expect(hud).toContain('filterCount > 0');
    expect(hud).toContain('(${filterCount})');
  });
});
