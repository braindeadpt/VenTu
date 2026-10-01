/**
 * Labels de categoria de notícias — fonte única (D9).
 *
 * Antes havia três cópias divergentes: o NewsCard punha o SLU cru no chip
 * («big-wave» a servir de texto), o NewsDetailHeader só conhecia 6 das 13
 * categorias (big-wave/foil/sup/... caíam no sludge) e o NewsFilters tinha
 * a lista completa. Agora os três importam daqui.
 */
/**
 * Desportos são nomes próprios (iguais em todas as línguas); as restantes
 * categorias vêm do dicionário (`newsCategories`, 5 línguas).
 */
const SPORT_CATEGORY_LABELS: Record<string, string> = {
  surf: 'Surf',
  kitesurf: 'Kitesurf',
  windsurf: 'Windsurf',
  'big-wave': 'Big Wave',
  sup: 'SUP',
  foil: 'Foil',
  bodyboard: 'Bodyboard',
  wakeboard: 'Wakeboard',
};

/** Categoria traduzida para o locale (nomes próprios à parte). */
export function newsCategoryLabel(category: string, locale: string): string {
  const proper = SPORT_CATEGORY_LABELS[category];
  if (proper) return proper;
  const t = getTranslation(locale).newsCategories;
  switch (category) {
    case 'all':
      return t.all;
    case 'competition':
      return t.competition;
    case 'safety':
      return t.safety;
    case 'general':
      return t.general;
    case 'alert':
      return t.alert;
    default:
      return category;
  }
}import { getTranslation } from '@/lib/i18n';

