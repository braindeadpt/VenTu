/** mapUiChrome — cromo do mapa: HUD, controlos, trilho temporal (M2). Criado pelo M1; a M2 preenche.
 *  Regra de namespaces (docs/design/MAP-ZONES.md): aqui só entram chaves NOVAS — as chaves
 *  históricas do mapa vivem em `t.map` e as da Diana em `t.spotsMap`/`t.spotsUi`.
 *
 *  M2 (UX v3): pilha de controlos à direita, pill de tempo + scrubber de 48 h e
 *  legenda flutuante — cópias que não existiam em t.map/spotsMap. */
export const mapUiChrome = {
  pt: {
    /** aria-label da pilha vertical de controlos (role=toolbar). */
    controlsLabel: 'Controlos do mapa',
    zoomIn: 'Aproximar',
    zoomOut: 'Afastar',
    /** «Agora» — pill de tempo e botão que volta ao frame 0. */
    timeNow: 'Agora',
    /** Legenda textual do scrubber (junto à hora seleccionada). */
    scrubBestHint: 'melhor score na vista, de 3 em 3 h',
    /** Versão curta para o cabeçalho móvel (M7 — sem reticências). */
    scrubBestHintShort: 'melhor da vista, 3 em 3 h',
    /** aria-valuetext do slider de horas — '{time}' = «qui 17 set, 12:00». */
    scrubValueText: '{time} — melhor score na vista {score}',
    /** Título «Score» do cartão da legenda. */
    legendScoreTitle: 'Score',
    /** B5 · legenda v6: título, linha da noite e linha da escala antiga (SUP/wakeboard). */
    legendNotaV6: 'Nota · 0–10',
    legendNightV6: 'Noite: sem nota até ao nascer do sol',
    legendLegacyV6: '{sport}: escala antiga, a rever',
  },
  en: {
    controlsLabel: 'Map controls',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    timeNow: 'Now',
    scrubBestHint: 'best score in view, every 3 h',
    scrubBestHintShort: 'best in view, 3-hourly',
    scrubValueText: '{time} — best score in view {score}',
    legendScoreTitle: 'Score',
    legendNotaV6: 'Score · 0–10',
    legendNightV6: 'Night: no score until sunrise',
    legendLegacyV6: '{sport}: old scale, under review',
  },
  es: {
    controlsLabel: 'Controles del mapa',
    zoomIn: 'Acercar',
    zoomOut: 'Alejar',
    timeNow: 'Ahora',
    scrubBestHint: 'mejor puntuación en vista, cada 3 h',
    scrubBestHintShort: 'mejor en vista, cada 3 h',
    scrubValueText: '{time} — mejor puntuación en vista {score}',
    legendScoreTitle: 'Score',
    legendNotaV6: 'Puntuación · 0–10',
    legendNightV6: 'Noche: sin nota hasta el amanecer',
    legendLegacyV6: '{sport}: escala antigua, en revisión',
  },
  de: {
    controlsLabel: 'Kartensteuerung',
    zoomIn: 'Vergrößern',
    zoomOut: 'Verkleinern',
    timeNow: 'Jetzt',
    scrubBestHint: 'bester Score in der Ansicht, alle 3 h',
    scrubBestHintShort: 'bester im Blick, alle 3 h',
    scrubValueText: '{time} — bester Score in der Ansicht {score}',
    legendScoreTitle: 'Score',
    legendNotaV6: 'Note · 0–10',
    legendNightV6: 'Nacht: keine Note bis Sonnenaufgang',
    legendLegacyV6: '{sport}: alte Skala, wird überarbeitet',
  },
  fr: {
    controlsLabel: 'Contrôles de la carte',
    zoomIn: 'Zoom avant',
    zoomOut: 'Zoom arrière',
    timeNow: 'Maintenant',
    scrubBestHint: 'meilleur score en vue, toutes les 3 h',
    scrubBestHintShort: 'meilleur en vue, toutes les 3 h',
    scrubValueText: '{time} — meilleur score en vue {score}',
    legendScoreTitle: 'Score',
    legendNotaV6: 'Note · 0–10',
    legendNightV6: 'Nuit : pas de note avant le lever du soleil',
    legendLegacyV6: '{sport} : ancienne échelle, en révision',
  },
} as const;

export type mapUiChromeDict = typeof mapUiChrome.pt;
