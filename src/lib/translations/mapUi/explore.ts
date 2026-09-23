/** mapUiExplore — painel/sheet de exploração e lista do viewport (M3).
 *  Regra de namespaces (docs/design/MAP-ZONES.md): aqui só entram chaves NOVAS — as chaves
 *  históricas do mapa vivem em `t.map` e as da Diana em `t.spotsMap`/`t.spotsUi`. */
export const mapUiExplore = {
  pt: {
    /** Título do painel/sheet — «Explorar». */
    title: 'Explorar',
    /** Contagem no cabeçalho do painel — «114 spots nesta vista». */
    spotsInViewCount: '{count} spots nesta vista',
    /** Contagem no rail colapsado (vertical) — forma curta. */
    railCount: '{count} spots',
    /** Botão «Filtros» no peek do sheet; com filtros activos mostra a contagem. */
    filters: 'Filtros',
    filtersWithCount: 'Filtros ({count})',
    /** aria-label dos chips de filtro activos — «Remover filtro Surf». */
    removeFilter: 'Remover filtro {label}',
    /** Grupo «Saltar para» no cabeçalho da lista — salta a vista para a região. */
    jumpTo: 'Saltar para',
    continent: 'Continente',
    /** Nota por cima da lista — «Ordenado por score · métricas de agora». */
    sortedHintNow: 'Ordenado por score · métricas de agora',
    /** Com o trilho das 48 h activo — «Ordenado por score às 17h · métricas de agora». */
    sortedHintAt: 'Ordenado por score às {time} · métricas de agora',
    /** Kicker do cartão «Melhor» no peek quando há hora activa — «Melhor 17h». */
    bestAt: 'Melhor {time}',
    /** Lista vazia — «Nenhum spot nesta vista com estes filtros.» */
    emptyView: 'Nenhum spot nesta vista com estes filtros.',
    /** Acção curta na linha neutra das boias — «Dispensar». */
    dismiss: 'Dispensar',
  },
  en: {
    title: 'Explore',
    spotsInViewCount: '{count} spots in view',
    railCount: '{count} spots',
    filters: 'Filters',
    filtersWithCount: 'Filters ({count})',
    removeFilter: 'Remove filter {label}',
    jumpTo: 'Jump to',
    continent: 'Mainland',
    sortedHintNow: 'Sorted by score · current metrics',
    sortedHintAt: 'Sorted by score at {time} · current metrics',
    bestAt: 'Best {time}',
    emptyView: 'No spots in view with these filters.',
    dismiss: 'Dismiss',
  },
  es: {
    title: 'Explorar',
    spotsInViewCount: '{count} spots en la vista',
    railCount: '{count} spots',
    filters: 'Filtros',
    filtersWithCount: 'Filtros ({count})',
    removeFilter: 'Quitar filtro {label}',
    jumpTo: 'Saltar a',
    continent: 'Continente',
    sortedHintNow: 'Ordenado por score · métricas actuales',
    sortedHintAt: 'Ordenado por score a las {time} · métricas actuales',
    bestAt: 'Mejor {time}',
    emptyView: 'Ningún spot en esta vista con estos filtros.',
    dismiss: 'Descartar',
  },
  de: {
    title: 'Entdecken',
    spotsInViewCount: '{count} Spots in der Ansicht',
    railCount: '{count} spots',
    filters: 'Filter',
    filtersWithCount: 'Filter ({count})',
    removeFilter: 'Filter {label} entfernen',
    jumpTo: 'Springe zu',
    continent: 'Festland',
    sortedHintNow: 'Nach Score sortiert · aktuelle Messwerte',
    sortedHintAt: 'Nach Score sortiert um {time} · aktuelle Messwerte',
    bestAt: 'Bester {time}',
    emptyView: 'Keine Spots in dieser Ansicht mit diesen Filtern.',
    dismiss: 'Verwerfen',
  },
  fr: {
    title: 'Explorer',
    spotsInViewCount: '{count} spots dans la vue',
    railCount: '{count} spots',
    filters: 'Filtres',
    filtersWithCount: 'Filtres ({count})',
    removeFilter: 'Retirer le filtre {label}',
    jumpTo: 'Aller à',
    continent: 'Continent',
    sortedHintNow: 'Trié par score · métriques actuelles',
    sortedHintAt: 'Trié par score à {time} · métriques actuelles',
    bestAt: 'Meilleur {time}',
    emptyView: 'Aucun spot dans cette vue avec ces filtres.',
    dismiss: 'Ignorer',
  },
} as const;

export type mapUiExploreDict = typeof mapUiExplore.pt;
