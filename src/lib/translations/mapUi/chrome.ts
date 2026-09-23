/** mapUiChrome — cromo do mapa: HUD, controlos, trilho temporal (M2). Criado pelo M1; a M2 preenche.
 *  Regra de namespaces (docs/design/MAP-ZONES.md): aqui só entram chaves NOVAS — as chaves
 *  históricas do mapa vivem em `t.map` e as da Diana em `t.spotsMap`/`t.spotsUi`. */
export const mapUiChrome = {
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

export type mapUiChromeDict = typeof mapUiChrome.pt;
