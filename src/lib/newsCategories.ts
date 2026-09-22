/**
 * Labels de categoria de notícias — fonte única (D9).
 *
 * Antes havia três cópias divergentes: o NewsCard punha o SLU cru no chip
 * («big-wave» a servir de texto), o NewsDetailHeader só conhecia 6 das 13
 * categorias (big-wave/foil/sup/... caíam no sludge) e o NewsFilters tinha
 * a lista completa. Agora os três importam daqui.
 */
export const newsCategoryLabels: Record<string, { pt: string; en: string }> = {
  all:         { pt: 'Todas',      en: 'All' },
  surf:        { pt: 'Surf',       en: 'Surf' },
  kitesurf:    { pt: 'Kitesurf',   en: 'Kitesurf' },
  windsurf:    { pt: 'Windsurf',   en: 'Windsurf' },
  'big-wave':  { pt: 'Big Wave',   en: 'Big Wave' },
  sup:         { pt: 'SUP',        en: 'SUP' },
  foil:        { pt: 'Foil',       en: 'Foil' },
  bodyboard:   { pt: 'Bodyboard',  en: 'Bodyboard' },
  wakeboard:   { pt: 'Wakeboard',  en: 'Wakeboard' },
  competition: { pt: 'Competição', en: 'Competition' },
  safety:      { pt: 'Segurança',  en: 'Safety' },
  general:     { pt: 'Geral',      en: 'General' },
  alert:       { pt: 'Alerta',     en: 'Alert' },
};

/** Categoria traduzida para o locale (PT primeiro; EN para todo o resto —
 *  mesmo contrato `locale === 'pt' ? pt : en` do resto das news). */
export function newsCategoryLabel(category: string, locale: string): string {
  const entry = newsCategoryLabels[category];
  if (!entry) return category;
  return locale === 'pt' ? entry.pt : entry.en;
}
