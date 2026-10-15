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
export function toHomepageSpotLite<T extends HomepageSpotData>(row: T, locale?: string): T {
  const spot = { ...row.spot, description: '', descriptionEn: '', hazards: [] as string[] };
  delete spot.localTips;
  if (locale !== 'pt' || !row.allScores) return { ...row, spot };
  // /pt (#183): os textos em inglês das notas por modalidade (ratingEn, factorsEn,
  // warningEn) não são lidos pelas secções da home em pt — os cards escolhem pelo
  // locale; o `factorsEn` canónico só o lê o `getSpotScoreFactors` (popup/sheet do
  // mapa e hero do spot), que a home deixou de montar com o hero Leaflet — e eram
  // ~1/3 do payload de `allScores` (185 spots × 9 modalidades). As outras línguas
  // ficam iguais.
  const allScores = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(row.allScores)) {
    if (!v || typeof v !== 'object') {
      allScores[k] = v;
      continue;
    }
    const { ratingEn: _r, factorsEn: _f, warningEn: _w, ...resto } = v as unknown as Record<string, unknown>;
    allScores[k] = resto;
  }
  return { ...row, spot, allScores: allScores as unknown as T['allScores'] };
}
