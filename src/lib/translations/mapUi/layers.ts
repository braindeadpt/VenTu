/** mapUiLayers — camadas, basemap e legendas (M5). Criado pelo M1; a M5 preenche.
 *  Regra de namespaces (docs/design/MAP-ZONES.md): aqui só entram chaves NOVAS — as chaves
 *  históricas do mapa vivem em `t.map` e as da Diana em `t.spotsMap`/`t.spotsUi`. */
export const mapUiLayers = {
  pt: {
    // (vazio — as chaves chegam na sessão dona)
  },
  en: {
    // (vazio — as chaves chegam na sessão dona)
  },
  es: {
    // (vazio — as chaves chegam na sessão dona)
  },
  de: {
    // (vazio — as chaves chegam na sessão dona)
  },
  fr: {
    // (vazio — as chaves chegam na sessão dona)
  },
} as const;

export type mapUiLayersDict = typeof mapUiLayers.pt;
