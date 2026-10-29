/**
 * Carregamento dos favoritos (condições, nota «agora» e, de noite, as janelas
 * candidatas) — puro sobre as dependências, para o FavoritesClient e os testes.
 *
 * Revisão #358 (4): as janelas de noite resolvem-se SEMPRE, também quando um
 * favorito não tem entrada no conditions.json e se cai no fallback live (antes
 * ficavam por resolver e os favoritos de noite mostravam «Sem janela boa»).
 * Cada carregamento devolve o estado inteiro (quem chama substitui, nunca junta).
 */
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import type { Conditions } from '@/lib/sportScore';
import type { JanelasCandidatasBySport } from '@/lib/bestWindowToday';
import { isNoite, notaV6DoSpot, scoreAgoraComV6, type NotaV6Agora, type SportScoreAgoraV6 } from '@/lib/notaV6Agora';
import { getConditionsDataId } from '@/lib/spotConditionsSource';
import { rawToScoreInput } from '@/lib/scoreConditions';

export interface CondicoesFavorito extends Conditions {
  source?: 'real' | 'mock';
  updatedAt?: string;
}

export interface JanelasFavoritos {
  nowMs: number;
  porSpot: Record<string, JanelasCandidatasBySport>;
}

export interface DepsFavoritos {
  /** conditions.json servido (ou `null` se falhou). */
  conditionsJson: () => Promise<Record<string, unknown> | null>;
  /** Fallback live (Open-Meteo) de um spot sem entrada no conditions.json. */
  marine: (spot: Spot) => Promise<CondicoesFavorito>;
  janelasDeNoite: (spot: Spot, input: Conditions, nv: NotaV6Agora | null, nowMs: number) => Promise<JanelasCandidatasBySport>;
  nowMs: number;
}

export interface Favoritos {
  conditions: Record<string, CondicoesFavorito>;
  scores: Record<string, SportScoreAgoraV6>;
  janelas: JanelasFavoritos | null;
}

export const desportoPrincipal = (spot: Pick<Spot, 'compatibleSports' | 'type'>): SportType =>
  (spot.compatibleSports?.[0] || spot.type) as SportType;

export async function carregarFavoritos(
  favorites: readonly string[],
  todos: readonly Spot[],
  deps: DepsFavoritos,
): Promise<Favoritos> {
  const conditions: Record<string, CondicoesFavorito> = {};
  const scores: Record<string, SportScoreAgoraV6> = {};
  const deNoite: Array<Promise<readonly [string, JanelasCandidatasBySport]>> = [];
  const { nowMs } = deps;

  let json: Record<string, unknown> | null = null;
  try {
    json = await deps.conditionsJson();
  } catch {
    json = null;
  }

  if (json) {
    for (const id of favorites) {
      const spot = todos.find((s) => s.id === id);
      if (!spot) continue;
      const cond = json[getConditionsDataId(spot)] ?? json[spot.id];
      if (!cond || typeof cond !== 'object') continue;
      const rec = cond as Record<string, unknown>;
      const scoreInput = rawToScoreInput(rec);
      conditions[id] = {
        ...scoreInput,
        source: 'real',
        updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : undefined,
      };
      // v6: o `notaV6` do pipeline (o mesmo número do /mapa e das listas)
      const nv = notaV6DoSpot(spot, json);
      scores[id] = scoreAgoraComV6(spot, desportoPrincipal(spot), scoreInput, nv);
      if (isNoite(scores[id])) {
        deNoite.push(
          deps
            .janelasDeNoite(spot, scoreInput, nv, nowMs)
            .catch(() => ({}) as JanelasCandidatasBySport)
            .then((w) => [id, w] as const),
        );
      }
    }
  }

  // fallback live só para os que faltam — e as janelas de noite resolvem-se na mesma
  await Promise.all(
    favorites.map(async (id) => {
      if (conditions[id]) return;
      const spot = todos.find((s) => s.id === id);
      if (!spot) return;
      try {
        const current = await deps.marine(spot);
        conditions[id] = current;
        // sem `notaV6` do pipeline: v6 «sem dados», SUP / wakeboard no motor antigo (#218, PR 6)
        scores[id] = scoreAgoraComV6(spot, desportoPrincipal(spot), current, null);
      } catch {
        /* ignore */
      }
    }),
  );

  const pares = await Promise.all(deNoite);
  return { conditions, scores, janelas: pares.length ? { nowMs, porSpot: Object.fromEntries(pares) } : null };
}
