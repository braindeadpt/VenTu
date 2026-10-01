import { describe, it, expect } from 'vitest';
import { spots } from '@/lib/spots';
import { getMacroRegion, MACRO_REGIONS } from '@/lib/regions';

/**
 * Invariante de cobertura regional — cada spot tem de cair numa macro-região
 * conhecida. Regressão M3: «Marinha Grande», «Grândola» e «Sines» faltavam
 * ao mapa de municípios, por isso Praia da Vieira, Tróia/Comporta e Sines
 * desapareciam silenciosamente dos filtros Centro/Alentejo no mapa. Um
 * município novo em spots.ts sem entrada em regions.ts falha aqui em vez
 * de falhar no ecrã.
 */
describe('getMacroRegion — cobertura total dos spots', () => {
  it('nenhum spot fica sem macro-região', () => {
    const missing = spots
      .filter((s) => !getMacroRegion(s.region))
      .map((s) => `${s.name} (${s.region})`);
    expect(missing).toEqual([]);
  });

  it('todas as macro-regiões resolvidas são membros de MACRO_REGIONS', () => {
    const valid = new Set<string>(MACRO_REGIONS);
    const invalid = spots
      .map((s) => getMacroRegion(s.region))
      .filter((r) => !valid.has(r));
    expect(invalid).toEqual([]);
  });

  it('municípios repostos na correcção M3 resolvem à macro-região certa', () => {
    expect(getMacroRegion('Marinha Grande')).toBe('Centro');
    expect(getMacroRegion('Grândola')).toBe('Alentejo');
    expect(getMacroRegion('Sines')).toBe('Alentejo');
  });
});
