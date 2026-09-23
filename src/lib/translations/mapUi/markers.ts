/** mapUiMarkers — marcadores/clusters/pré-visualização (M4). Criado pelo M1; a M4 preenche.
 *  Regra de namespaces (docs/design/MAP-ZONES.md): aqui só entram chaves NOVAS — as chaves
 *  históricas do mapa vivem em `t.map` e as da Diana em `t.spotsMap`/`t.spotsUi`. */
export const mapUiMarkers = {
  pt: {
    /** Sheet de spot (mobile) — volta à lista de spots do viewport. */
    backToList: 'Voltar à lista',
    /** aria-label do badge «+N» no marcador — `{n}` é a contagem escondida. */
    moreSpotsNearby: 'Mais {n} spots perto — ampliar',
    /** aria-label do cartão de pré-visualização (desktop). */
    spotCardAria: 'Pré-visualização do spot',
    /** Rótulos da sparkline das 48 h no cartão/sheet do spot. */
    sparkNow: 'agora',
    sparkNext48h: 'próximas 48 h',
    sparkThresholdHint: 'Linha tracejada = 60 (Bom)',
    /** Métricas do cartão de pré-visualização. */
    metricWave: 'Onda',
    metricPeriod: 'Período',
    metricWind: 'Vento',
    /** «Porquê» do cartão quando o filtro é «Todas as modalidades». */
    bestModality: 'Melhor modalidade',
    /** Hora actual no rótulo temporal do cartão. */
    now: 'agora',
  },
  en: {
    backToList: 'Back to list',
    moreSpotsNearby: '{n} more spots nearby — zoom in',
    spotCardAria: 'Spot preview',
    sparkNow: 'now',
    sparkNext48h: 'next 48 h',
    sparkThresholdHint: 'Dashed line = 60 (Good)',
    metricWave: 'Wave',
    metricPeriod: 'Period',
    metricWind: 'Wind',
    bestModality: 'Best sport',
    now: 'now',
  },
  es: {
    backToList: 'Volver a la lista',
    moreSpotsNearby: '{n} spots más cerca — ampliar',
    spotCardAria: 'Vista previa del spot',
    sparkNow: 'ahora',
    sparkNext48h: 'siguientes 48 h',
    sparkThresholdHint: 'Línea discontinua = 60 (Bueno)',
    metricWave: 'Ola',
    metricPeriod: 'Período',
    metricWind: 'Viento',
    bestModality: 'Mejor modalidad',
    now: 'ahora',
  },
  de: {
    backToList: 'Zurück zur Liste',
    moreSpotsNearby: '{n} weitere Spots in der Nähe — heranzoomen',
    spotCardAria: 'Spot-Vorschau',
    sparkNow: 'jetzt',
    sparkNext48h: 'nächste 48 h',
    sparkThresholdHint: 'Gestrichelte Linie = 60 (Gut)',
    metricWave: 'Welle',
    metricPeriod: 'Periode',
    metricWind: 'Wind',
    bestModality: 'Beste Sportart',
    now: 'jetzt',
  },
  fr: {
    backToList: 'Retour à la liste',
    moreSpotsNearby: '{n} spots de plus à proximité — zoomer',
    spotCardAria: 'Aperçu du spot',
    sparkNow: 'maintenant',
    sparkNext48h: 'prochaines 48 h',
    sparkThresholdHint: 'Ligne pointillée = 60 (Bon)',
    metricWave: 'Vague',
    metricPeriod: 'Période',
    metricWind: 'Vent',
    bestModality: 'Meilleure discipline',
    now: 'maintenant',
  },
} as const;

export type mapUiMarkersDict = typeof mapUiMarkers.pt;
