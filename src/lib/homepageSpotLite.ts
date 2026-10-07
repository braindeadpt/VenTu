import type { HomepageSpotData } from '@/lib/homepageSport';

/**
 * Forma «lite» das rows da home para o payload RSC.
 *
 * A home serializa os ~185 spots como props de componentes cliente
 * (HomeAdaptive → mapa, A bombar, ranking). Os textos longos do spot
 * (descrições PT/EN, dicas locais, perigos) só são lidos na página do spot,
 * mas iam inteiros no HTML da home. Ficam vazios aqui; tudo o que o scoring
 * no cliente (refreshGridSpotScores → facilities, bestWind, orientação…) e os
 * cards/mapa usam mantém-se.
 */
export function toHomepageSpotLite<T extends HomepageSpotData>(row: T): T {
  const spot = { ...row.spot, description: '', descriptionEn: '', hazards: [] as string[] };
  delete spot.localTips;
  return { ...row, spot };
}
