# Mapa — compartimentos (UX v3, M1)

O `SpotMapInteractive` foi repartido em 4 compartimentos com UM dono cada,
para que as sessões M2–M5 trabalhem em paralelo sem conflitos. O
orquestrador continua a ser o único ponto de entrada dos anfitriões
(homepage hero, /mapa, grid de spots); o estado partilhado vive nele e é
exposto às zonas via `MapUiContext` (dados + acções, padrão do
`SpotTimelineProvider`).

## Tabela zona → dono → ficheiros → props → contexto

| Zona | Dono | Ficheiros | Hooks | Props principais | Lê do contexto | Escreve no contexto |
|---|---|---|---|---|---|---|
| **Cromo** | M2 | `map/zones/MapChromeZone.tsx`, `map/components/MapControls.tsx`, `map/components/MapQuickActions.tsx`, `MapLegend.tsx`, `WindRingLegend.tsx`, `map/MapTimeTrack.tsx`, `map/MapTideChip.tsx`, `map/MapThermalChip.tsx`, `map/useMapTimeTrack.ts`, `map/hooks/useMapLocate.ts` | `useMapChromeZone` | `controls` (props do `MapControls`), `locateLabel`/`shareLabel`, `isobaths*`/`radarLift`/`legendLayerProps` (visibilidade da legenda), `state` (locate/share/wind-legend do hook), `windButtonRef` | — | — |
| **Explorar** | M3 | `map/zones/MapExploreZone.tsx`, `map/components/MapSpotPanel.tsx`, `map/components/MapExploreSheet.tsx`, `map/components/MapSpotList.tsx`, `BuoyLayerChip.tsx` | `useMapExploreZone` | `mapHud`, `state` (sheet/painel/rows/extras do hook), `sheetLayers` + `legendLayerProps` (montados pela M5), `basemapMode`/`onBasemapChange`, `exitFullscreenLabel`/`onExitFullscreen`, `onlyOn*`, `timeTrack` (nó da M2), `attributionHtml` | `isPt`, `locale`, `focusSpotId`, `isMobile` | `focusSpot` (clique na linha) |
| **Marcadores** | M4 | `map/zones/MapMarkersZone.tsx`, `map/hooks/useMapMarkers.ts`, `mapMarkers.ts` (`resolveExploreChrome`, `applyExploreMapFit`), `MapClusterIcon.tsx`, `MapSpotPreview.tsx`, `MapSpotSheet.tsx`, bloco markercluster em `useMapCore.ts` | `useMapMarkersZone` | refs do núcleo (`clusterGroupRef`/`markersGroupRef`/`markersCacheRef`/`mapRef`), `visibleSpots`, `warningsBySpot` (interno), `hourScores`, `activeCluster`/`showWindOnMarkers`, `exploreChrome` (do painel), `setSheetSpot` | `isMobile`, `sheetSpot`, `sport`, `locale` | `selectSpot`, `closeSpotSheet` (e `openSpotSheet` para a pré-visualização) |
| **Camadas** | M5 | `map/zones/MapLayersZone.tsx`, `map/hooks/useMapLayers.ts`, `map/hooks/useMap{Hours,BuoyDots,Hs,Sst,Currents,Wind}Field.ts`, `map/hooks/useMapAttribution.ts`, `map/components/MapLayersMenu.tsx`, `map/components/MapBasemapRadio.tsx`, `MapLayerToggle.tsx`, `RadarCarousel.tsx`, fit inicial em `useMapCore.ts` | `useMapLayersBase` + `useMapLayersFields` | `t` (rótulos `mapUiLayers`), tiles (`tileState`/`retryBasemap`/`refreshLabel`), `basemapMode`/`onBasemapChange`, hero (`radar*`/`isobaths*`), carrossel de radar, `panelCollapsed` (desvio do carrossel) | — | — |

## `MapUiContext` (`map/MapUiContext.tsx`)

Estado partilhado, separado em **dados** (`MapUiData`) e **acções**
(`MapUiActions`) — dois contextos para que consumidores de acções não
re-renderizem com os dados.

### Dados

| Campo | Dono do estado | Lido por |
|---|---|---|
| `sport`, `region`, `locale`, `isPt` | props do anfitrião | marcadores (ítem/filtro), explorar (nomes na lista), camadas |
| `isReady`, `clusterReady` | `useMapCore` | todas as zonas (gates de render) |
| `isMobile`, `isFullscreen`, `isHeroEmbed` | núcleo + orquestrador | todas as zonas |
| `hoursLive`, `hoursTimes`, `hoursFrame`, `hourScores` | `useMapLayersBase` (`useMapHours`) + derivação do orquestrador | marcadores (score por hora), explorar (score das linhas), cromo (trilho) |
| `visibleSpots` | derivação do orquestrador | marcadores, explorar |
| `focusSpotId` | prop do anfitrião | explorar (linha focada) |
| `sheetSpot` | orquestrador | marcadores (sheet de detalhe) |

### Acções

| Acção | Implementa | Chamada por |
|---|---|---|
| `selectSpot(spotId)` | `onSpotSelect` do anfitrião | marcadores (popup → página do spot) |
| `focusSpot(spotId, openDetail?)` | `focusMapSpot` (flyTo + popup/sheet) | explorar (linhas da lista) |
| `openSpotSheet` / `closeSpotSheet` | `setSheetSpot` | marcadores |
| `setHoursFrame(index)` | `handleHoursFrameChange` | trilho temporal (cromo) |
| `toggleCluster` / `toggleWind` / `toggleOnlyOn` | toggles + localStorage | cromo (toolbar) + explorar (extras/painel) |

## Regras de fronteira

- O **estado** vive no orquestrador (ou dentro da zona dona); o contexto só
  transporta o que é partilhado — não é um catch-all.
- Itens de camada (`sheetLayers`), props de legenda (`legendLayerProps`) e
  rótulos de camadas (`layerCopy`) são montados pela **M5** e chegam às
  outras zonas como props — copiar o JSX de um item para outra zona é
  regressão.
- O trilho temporal (`timeTrackNode`) é montado pela **M2** e chega à
  explorar como prop `timeTrack`.
- Avisos por pin (`warningsBySpot`) são da **M4**; o chip de boias
  (`BuoyLayerChip`) é da **M3**.
- O bloco `markerClusterGroup` em `useMapCore.ts` é da **M4**; o bloco de
  fit inicial (`applyExploreMapFit` no init) é da **M5** — marcados no
  código.

## Traduções (M1)

| Namespace | Zona | Ficheiro |
|---|---|---|
| `mapUiChrome` | M2 | `src/lib/translations/mapUi/chrome.ts` |
| `mapUiExplore` | M3 | `src/lib/translations/mapUi/explore.ts` |
| `mapUiMarkers` | M4 | `src/lib/translations/mapUi/markers.ts` (vazio — a M4 preenche) |
| `mapUiLayers` | M5 | `src/lib/translations/mapUi/layers.ts` |

Chaves movidas de `t.map.*` para o namespace da zona dona, sem mudar textos
(5 locales). O que ficou em `t.map` é partilhado fora da superfície do mapa
ou órfão — limpeza fica para a integração (M6).
