/** mapUiExplore — painel/sheet (M3): filtros, lista, aviso de boias. */
export const mapUiExplore = {
  pt: {
    showAllSpots: 'Mostrar todos',
    clusterSpots: 'Agrupar spots',
    buoysShowOnMap: 'Ver no mapa',
    onlyOn: 'Só a bombar',
    onlyOnOff: 'Todos os spots',
    onlyOnHint: 'Score ≥ 60 — só spots a bombar para a modalidade seleccionada',
  },
  en: {
    showAllSpots: 'Show all',
    clusterSpots: 'Cluster spots',
    buoysShowOnMap: 'Show on the map',
    onlyOn: 'Firing only',
    onlyOnOff: 'All spots',
    onlyOnHint: 'Score ≥ 60 — only spots firing for the selected sport',
  },
  es: {
    showAllSpots: 'Mostrar todos',
    clusterSpots: 'Agrupar spots',
    buoysShowOnMap: 'Ver en el mapa',
    onlyOn: 'Solo a tope',
    onlyOnOff: 'Todos los spots',
    onlyOnHint: 'Score ≥ 60 — solo spots a tope para la modalidad seleccionada',
  },
  de: {
    showAllSpots: 'Alle anzeigen',
    clusterSpots: 'Spots gruppieren',
    buoysShowOnMap: 'Auf der Karte zeigen',
    onlyOn: 'Nur laufende',
    onlyOnOff: 'Alle Spots',
    onlyOnHint: 'Score ≥ 60 — nur laufende Spots für die gewählte Disziplin',
  },
  fr: {
    showAllSpots: 'Tout afficher',
    clusterSpots: 'Regrouper les spots',
    buoysShowOnMap: 'Voir sur la carte',
    onlyOn: 'Uniquement à fond',
    onlyOnOff: 'Tous les spots',
    onlyOnHint: 'Score ≥ 60 — uniquement les spots à fond pour la discipline sélectionnée',
  },
} as const;

export type mapUiExploreDict = typeof mapUiExplore.pt;
