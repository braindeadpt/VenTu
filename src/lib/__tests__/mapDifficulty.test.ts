import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  lerNivelEscolhido,
  MAP_DIFFICULTY_LS_KEY,
  nivelDoSpot,
  spotDentroDoNivel,
  spotMatchesDifficultyFilter,
  type MapDifficultyFilter,
} from '@/lib/mapDifficulty';
import { spots } from '@/lib/spots';
import type { Spot } from '@/types';

const FILTROS: MapDifficultyFilter[] = ['all', 'beginner', 'intermediate', 'advanced'];
const NIVEIS: Spot['difficulty'][] = ['beginner', 'intermediate', 'advanced', 'expert', 'all'];

function mockLocalStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  vi.stubGlobal('localStorage', ls);
  vi.stubGlobal('window', { localStorage: ls });
  return { store };
}

describe('spotDentroDoNivel — regra de tecto (4 filtros × 5 níveis)', () => {
  // «Iniciante» mostra iniciante; «Intermédio» mostra iniciante + intermédio;
  // «Avançado» mostra tudo; «Todos» = sem filtro. 'expert' conta como avançado.
  const esperado: Record<MapDifficultyFilter, Record<Spot['difficulty'], boolean>> = {
    all: { beginner: true, intermediate: true, advanced: true, expert: true, all: true },
    beginner: { beginner: true, intermediate: false, advanced: false, expert: false, all: true },
    intermediate: { beginner: true, intermediate: true, advanced: false, expert: false, all: true },
    advanced: { beginner: true, intermediate: true, advanced: true, expert: true, all: true },
  };
  for (const filtro of FILTROS)
    for (const nivel of NIVEIS)
      it(`${filtro} × ${nivel} → ${esperado[filtro][nivel]}`, () => {
        expect(spotDentroDoNivel(nivel, filtro)).toBe(esperado[filtro][nivel]);
      });

  it('nível em falta ou desconhecido cabe sempre', () => {
    for (const filtro of FILTROS) {
      expect(spotDentroDoNivel(null, filtro)).toBe(true);
      expect(spotDentroDoNivel(undefined, filtro)).toBe(true);
      expect(spotDentroDoNivel('desconhecido' as Spot['difficulty'], filtro)).toBe(true);
    }
  });
});

describe('nivelDoSpot — nivel por modalidade', () => {
  const base = { difficulty: 'intermediate' } as Pick<Spot, 'difficulty' | 'difficultyBySport'>;
  const com = {
    difficulty: 'intermediate',
    difficultyBySport: { kitesurf: 'advanced' },
  } as Pick<Spot, 'difficulty' | 'difficultyBySport'>;

  it('sem desporto → a difficulty da ficha', () => {
    expect(nivelDoSpot(base)).toBe('intermediate');
    expect(nivelDoSpot(com)).toBe('intermediate');
  });
  it('com desporto sobreposto → a sobreposição', () => {
    expect(nivelDoSpot(com, 'kitesurf')).toBe('advanced');
  });
  it('com desporto sem sobreposição → a difficulty da ficha', () => {
    expect(nivelDoSpot(com, 'surf')).toBe('intermediate');
    expect(nivelDoSpot(base, 'kitesurf')).toBe('intermediate');
  });
});

describe('o Guincho é avançado só em kite (ficha real)', () => {
  const guincho = spots.find((s) => s.id === 'guincho')!;
  it('kite → avançado', () => expect(nivelDoSpot(guincho, 'kitesurf')).toBe('advanced'));
  it('surf → intermédio (a difficulty base)', () => expect(nivelDoSpot(guincho, 'surf')).toBe('intermediate'));
  it('sem desporto → intermédio', () => expect(nivelDoSpot(guincho)).toBe('intermediate'));
  it('o /mapa: filtro «Intermédio» + kite esconde o Guincho, + surf mostra-o', () => {
    expect(spotMatchesDifficultyFilter(guincho, 'intermediate', 'kitesurf')).toBe(false);
    expect(spotMatchesDifficultyFilter(guincho, 'intermediate', 'surf')).toBe(true);
    expect(spotMatchesDifficultyFilter(guincho, 'intermediate')).toBe(true);
  });
});

describe('lerNivelEscolhido — «sem nível» é null', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('chave ausente → null', () => {
    mockLocalStorage();
    expect(lerNivelEscolhido()).toBeNull();
  });
  it("'all' → null", () => {
    const { store } = mockLocalStorage();
    store.set(MAP_DIFFICULTY_LS_KEY, 'all');
    expect(lerNivelEscolhido()).toBeNull();
  });
  it("'intermediate' → 'intermediate'", () => {
    const { store } = mockLocalStorage();
    store.set(MAP_DIFFICULTY_LS_KEY, 'intermediate');
    expect(lerNivelEscolhido()).toBe('intermediate');
  });
  it('valor estragado → null (cai no default «all»)', () => {
    const { store } = mockLocalStorage();
    store.set(MAP_DIFFICULTY_LS_KEY, 'lixo');
    expect(lerNivelEscolhido()).toBeNull();
  });
});
