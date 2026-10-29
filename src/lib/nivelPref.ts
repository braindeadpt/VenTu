'use client';

/**
 * O nível do utilizador na home e no spot v6 (#nivel-ui): a chave do filtro do
 * /mapa e da lista de spots (`ventu:map:difficulty`), lida com
 * `lerNivelEscolhido` («Todos» e chave ausente = sem nível).
 *
 * Hidratação (React #418): o HTML estático e o 1.º render do cliente são
 * sempre «sem nível» (`null`); só depois de montar se lê o localStorage. Muda
 * com o evento `storage` (outro separador, ex.: o /mapa) e com `NIVEL_EVENT`
 * (o outro controlo na mesma página).
 */
import { useCallback, useEffect, useState } from 'react';
import { lerNivelEscolhido, MAP_DIFFICULTY_LS_KEY, type MapDifficultyFilter, type NivelUtilizador } from '@/lib/mapDifficulty';

export const NIVEL_EVENT = 'ventu:nivel';

export function gravarNivel(v: MapDifficultyFilter): void {
  try {
    localStorage.setItem(MAP_DIFFICULTY_LS_KEY, v);
  } catch {
    /* sem storage: fica só nesta página */
  }
  window.dispatchEvent(new CustomEvent(NIVEL_EVENT, { detail: v }));
}

export function useNivel(): [NivelUtilizador | null, (v: MapDifficultyFilter) => void] {
  const [nivel, setNivel] = useState<NivelUtilizador | null>(null);
  useEffect(() => {
    setNivel(lerNivelEscolhido());
    const rele = () => setNivel(lerNivelEscolhido());
    const ouveStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === MAP_DIFFICULTY_LS_KEY) rele();
    };
    const ouveProprio = (e: Event) => {
      const v = (e as CustomEvent).detail as MapDifficultyFilter;
      setNivel(v === 'all' ? null : v);
    };
    window.addEventListener('storage', ouveStorage);
    window.addEventListener(NIVEL_EVENT, ouveProprio);
    return () => {
      window.removeEventListener('storage', ouveStorage);
      window.removeEventListener(NIVEL_EVENT, ouveProprio);
    };
  }, []);
  const escolhe = useCallback((v: MapDifficultyFilter) => {
    setNivel(v === 'all' ? null : v);
    gravarNivel(v);
  }, []);
  return [nivel, escolhe];
}
