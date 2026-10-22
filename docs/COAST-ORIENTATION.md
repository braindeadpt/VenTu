# Orientação da costa (`coastOrientation`, #178)

`coastOrientation` (em `src/lib/spots.ts`) é a direcção para onde a praia está
virada: a normal da linha de costa que aponta para o **mar** (0 = N, 90 = E,
180 = S, 270 = W). É também o `praiaVirada` dos spots v6 não curados
(`src/lib/spotEditorial.ts`). Um vento que sopra *de* `coastOrientation` é
onshore; de `coastOrientation + 180°` é offshore (`classifyWind` e
`windSportDirectionSafety` em `src/lib/sportScore.ts`).

Até à #178, 144 dos 185 spots tinham 270° por defeito. O valor `0` era ainda
lido como «sem valor» (`|| 270`); passou a `?? 270` (0 = virada a norte).

## Como correr

O script corre à mão, offline. Não faz parte do pipeline nem do build, e o
browser não faz pedidos a terceiros.

```bash
# 1. descarregar a linha de costa OSM (Overpass) para .cache/coast-orientation/ (retoma; repetir até não faltar nada)
NODE_USE_ENV_PROXY=1 node scripts/compute-coast-orientation.mjs --fetch
# 2. recalcular a revisão a partir da cache (idempotente: a 2.ª corrida dá o mesmo ficheiro)
node scripts/compute-coast-orientation.mjs
# 3. aplicar a coluna `final` a src/lib/spots.ts
node scripts/compute-coast-orientation.mjs --apply
```

- O Overpass exige `User-Agent` (o script envia um). `overpass-api.de` estava
  saturado a 16/10; o script tenta `z.overpass-api.de`, `overpass.kumi.systems`,
  `overpass-api.de` e `overpass.openstreetmap.fr` por esta ordem, por células de 1°,
  e uma célula que falhe fica para a corrida seguinte.
- `NODE_USE_ENV_PROXY=1` só é preciso atrás de um proxy HTTP(S).
- Ao mudar as coordenadas de um spot, a cache desse spot deixa de valer e o
  `--fetch` volta a pedi-la.
- `atual` no ficheiro de revisão é o valor **antes** da #178; o script mantém-no
  depois do `--apply`, para a tabela continuar a mostrar antes → depois.
- `public/data/spots-index.json` não vai no PR: o CI e o `update-data.yml`
  regeneram-no (`npm run spots:index`) a partir de `spots.ts`.

## Método

Fonte: OpenStreetMap `natural=coastline` (© OpenStreetMap contributors, ODbL),
a ≤ 2 km de cada spot. No OSM, a linha de costa tem a terra à esquerda e a água
à direita, por isso a normal para o mar de um troço com rumo `b` é `b + 90°`.
Implementação pura e testada em `scripts/lib/coastOrientation.mjs`:

1. ponto P da costa mais próximo do spot;
2. reconstituir a cadeia de costa que passa em P (vias OSM ligadas pelas pontas);
3. **suavização de ~500 m:** a direcção da costa é a corda entre os pontos da
   cadeia a 250 m antes e 250 m depois de P, ao longo da costa. A normal para o
   mar dessa corda é o valor calculado, arredondado a 5°;
4. controlo da geometria:
   - a mesma corda a ±500 m (1 km) não pode divergir mais de 25°;
   - a «dobra» (ângulo entre a meia-corda antes de P e a meia-corda depois) não
     pode passar de 45°;
   - fora disto, a geometria é **ambígua** (ponta, enseada, foz).

   Uma corda ignora as rochas, os esporões e os recortes pequenos, que viram a
   normal do segmento mais próximo (`segmentoProximo` no JSON). A razão
   corda/arco (`retidao`) só se reporta: numa arriba recortada o arco OSM é
   muito longo e a razão cai sem a orientação ser duvidosa.

## Regras do valor final

| origem | quando | valor |
|---|---|---|
| curado v6 | os 21 spots de `spotEditorial.json` (os 19 da maquete, mais as variantes da Lagoa de Óbidos) | o `praiaVirada` revisto à mão: o motor antigo e o v6 passam a dizer o mesmo |
| OSM | geometria limpa | o calculado (500 m) |
| OSM 1 km | 500 m ambíguo, mas a corda de 1 km é limpa (corda/arco ≥ 0,85) | o calculado a 1 km |
| **mantido** | rio, albufeira, lagoa, ria, estuário (lista explícita `REVISAO_MANUAL`: Tejo, Seixal, Sado, Óbidos, Albufeira, Santo André, Sancha, Aveiro, Alvor, Ria Formosa, Cávado, Lima, Douro, Mira, S. Martinho); sem costa OSM a < 2 km; geometria ambígua; spot a > 1 km da costa, numa costa que não é recta | **não se adivinha**: fica o valor antigo, e o spot vai para revisão manual com o calculado ao lado |

Revisão (⚠) também quando:
- o calculado fica a > 20° de uma referência conhecida ou do curado;
- a diferença para o valor antigo passa de 45°;
- as escalas de 500 m e 1 km divergem mais de 15°;
- há outra costa a < 500 m (outra margem, ilhéu, molhe);
- o spot está a < 2 km de um curado e difere dele mais de 25°.

## Rever à mão

1. Em `data/coast-orientation-review.json`, filtrar `revisao: true`.
2. Para corrigir um spot, há duas formas:
   - curá-lo em `src/lib/spotEditorial.json` (passa a `origem: curado`);
   - ou corrigir as coordenadas em `spots.ts`, se o ponto não está na praia.
3. Correr outra vez os passos 2 e 3.

O teste `src/lib/__tests__/coastOrientation.test.ts` falha se:
- um spot ficar a 270° sem justificação;
- `spots.ts` e a revisão divergirem;
- um curado divergir do `praiaVirada`.

## Correcção de coordenadas (22/10)

31 spots tinham coordenadas longe da praia (de 1,1 a 25 km). Foram corrigidas
para a praia OSM `natural=beach` (Nominatim) e a orientação desses 31 foi
recalculada com este script (cache nova de `overpass.openstreetmap.fr`, OSM de
12/07; nos spots de controlo o espelho dá o mesmo resultado que a cache de
16/10). Os outros 154 spots não mudam. O teste
`src/lib/__tests__/spotCoordinates.test.ts` guarda as coordenadas corrigidas e a
coerência com o ficheiro de revisão.

Numa segunda passagem (22/10) foram corrigidos os 6 que faltavam
(`santa-catarina-terceira`, `cachorro-pico`, `formosa-santa-maria`,
`vale-figueiras`, `fao`, `barrinha-faro`), com coordenadas confirmadas pelo
Pedro (as de `fao` e `barrinha-faro` são pins dele no Google Maps), e a
orientação desses 6 foi recalculada da mesma forma. `carvalhal`
(Aljezur/Brejão) foi verificado e já estava certo; não mudou.

Em Fão ficam só 2 spots (decisão do Pedro, 22/10): `fao` é a praia de Fão/Ofir,
surf e kite no mar (pin «Praia Surf Fão Ofir», 41.5233,-8.7900), e absorve o
antigo `fao-ofir-surf`, que era um duplicado no mesmo ponto e foi removido;
`esposende` passa para o spot de kite no rio Cávado (pin «Kitesurf Spot»,
41.5336,-8.7892), só kitesurf. A orientação dos dois foi recalculada com a cache
nova de `esposende` (`overpass.openstreetmap.fr`): `fao` fica 235° (OSM) e
`esposende` fica 275° (curado v6; calculado 280°).

## Resultado (OSM de 2026-07-15T15:22:01Z)

- 184 spots, dos quais **121 mudam** de valor face ao antes da #178.
- Origem: OSM 107, OSM 1 km 2, curado 21, mantido 54.
- 106 spots ficam marcados para revisão.
- Spots a 270°: 143 → 47. Os que ficam têm 270° calculado, curado, ou mantido com motivo.

| spot | antes | calculado | depois | Δ | origem | revisão |
|---|---:|---:|---:|---:|---|---|
| `moledo` | 270 | 280 | **270** | 0 | curado v6 |  |
| `vila-praia-ancora` | 270 | 240 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 56°, 500 m vs 1 km 7°: ponta, enseada ou foz) |
| `afife` | 270 | 280 | **280** | 10 | OSM |  |
| `castelo-neiva` | 270 | 275 | **275** | 5 | OSM |  |
| `amorosa` | 270 | 255 | **255** | 15 | OSM |  |
| `cabedelo` | 270 | 210 | **265** | 5 | curado v6 | ⚠ calculado a 55° do curado v6 (265°) |
| `foil-cabedelo` | 270 | 210 | **270** | 0 | **mantido** | ⚠ água interior/abrigada: rio Lima (barra) |
| `cabedelo-wakepark` | 270 | 215 | **270** | 0 | **mantido** | ⚠ spot a 1033 m da costa; água interior/abrigada: rio Lima (wake park); longe da costa e costa não recta: não aplicado |
| `rodanho` | 270 | 265 | **265** | 5 | OSM |  |
| `ofir` | 270 | 260 | **260** | 10 | OSM |  |
| `esposende` | 270 | 280 | **275** | 5 | curado v6 | ⚠ água interior/abrigada: foz do Cávado (rio/mar) |
| `esposende-praia` | 270 | 265 | **265** | 5 | OSM |  |
| `fao` | 270 | 235 | **235** | 35 | OSM | ⚠ a 1141 m de esposende (curado 275°) com 40° de diferença |
| `apulia` | 270 | 240 | **240** | 30 | OSM |  |
| `povoa-varzim` | 270 | 245 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 46°, 500 m vs 1 km 24°: ponta, enseada ou foz); outra costa a 314 m (margem oposta, ilhéu ou molhe) |
| `azurara` | 270 | 225 | **225** | 45 | OSM |  |
| `leca-palmeira` | 270 | 275 | **275** | 5 | OSM |  |
| `matosinhos` | 270 | 220 | **255** | 15 | curado v6 | ⚠ calculado a 34° do curado v6 (255°) |
| `cabedelo-douro` | 270 | 260 | **260** | 10 | OSM |  |
| `marina-afurada-foil` | 270 | 255 | **270** | 0 | **mantido** | ⚠ spot a 1318 m da costa; água interior/abrigada: rio Douro (marina); longe da costa e costa não recta: não aplicado |
| `foil-fao-cavado` | 270 | 235 | **270** | 0 | **mantido** | ⚠ água interior/abrigada: rio Cávado |
| `foil-esposende-piscinas` | 270 | 275 | **270** | 0 | **mantido** | ⚠ água interior/abrigada: rio Cávado |
| `praia-da-lomba` | 270 |  | **270** | 0 | **mantido** | ⚠ sem linha de costa OSM a < 2000 m; água interior/abrigada: rio Douro (interior) |
| `salgueiros` | 270 | 240 | **240** | 30 | OSM |  |
| `sereia-costa-verde` | 270 | 270 | **270** | 0 | OSM |  |
| `canide-sul` | 270 | 255 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 63°, 500 m vs 1 km 13°: ponta, enseada ou foz) |
| `aguda` | 270 | 275 | **275** | 5 | OSM |  |
| `espinho` | 270 | 265 | **275** | 5 | curado v6 |  |
| `praia-37` | 270 | 285 | **285** | 15 | OSM |  |
| `bairro-piscatorio` | 270 | 220 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 62°, 500 m vs 1 km 22°: ponta, enseada ou foz) |
| `paramos` | 270 | 305 | **305** | 35 | OSM | ⚠ 500 m e 1 km divergem 24° (1 km: 279°) |
| `barrinha-esmoriz` | 270 | 290 | **270** | 0 | **mantido** | ⚠ água interior/abrigada: lagoa (Barrinha de Esmoriz) |
| `esmoriz` | 270 | 295 | **295** | 25 | OSM |  |
| `cortegaca` | 270 | 285 | **285** | 15 | OSM |  |
| `cortegaca-sul` | 270 | 290 | **290** | 20 | OSM |  |
| `maceda` | 270 | 285 | **285** | 15 | OSM |  |
| `murtosa` | 270 |  | **270** | 0 | **mantido** | ⚠ sem linha de costa OSM a < 2000 m; água interior/abrigada: Ria de Aveiro |
| `ria-torreira` | 270 |  | **270** | 0 | **mantido** | ⚠ sem linha de costa OSM a < 2000 m; água interior/abrigada: Ria de Aveiro |
| `praia-torreira` | 270 | 285 | **285** | 15 | OSM |  |
| `muranzel` | 270 | 290 | **290** | 20 | OSM |  |
| `furadouro` | 270 | 285 | **285** | 15 | OSM |  |
| `sao-jacinto` | 270 | 285 | **285** | 15 | OSM |  |
| `costa-nova` | 270 | 290 | **290** | 20 | OSM |  |
| `tocha` | 270 | 280 | **280** | 10 | OSM |  |
| `quiaios` | 270 | 290 | **290** | 20 | OSM |  |
| `figueira-foz` | 270 | 270 | **270** | 0 | OSM |  |
| `leirosa` | 270 | 300 | **300** | 30 | OSM | ⚠ 500 m e 1 km divergem 18° (1 km: 284°) |
| `praia-da-vieira` | 270 | 290 | **290** | 20 | OSM |  |
| `castelo-bode` | 270 |  | **270** | 0 | **mantido** | ⚠ sem linha de costa OSM a < 2000 m; água interior/abrigada: albufeira (interior) |
| `nazare` | 270 | 265 | **280** | 10 | curado v6 | ⚠ outra costa a 386 m (margem oposta, ilhéu ou molhe); calculado a 24° da referência 290° |
| `foz-arelho` | 270 | 310 | **270** | 0 | **mantido** | ⚠ spot a 1790 m da costa; água interior/abrigada: Lagoa de Óbidos; a 1892 m de obidos-lagoon-sul (curado 300°) com 30° de diferença; a 1309 m de obidos-lagoon-foz (curado 300°) com 30° de diferença |
| `foil-foz-arelho` | 270 | 310 | **270** | 0 | **mantido** | ⚠ spot a 1790 m da costa; água interior/abrigada: Lagoa de Óbidos; a 1892 m de obidos-lagoon-sul (curado 300°) com 30° de diferença; a 1309 m de obidos-lagoon-foz (curado 300°) com 30° de diferença |
| `obidos-lagoon` | 270 |  | **300** | 30 | curado v6 | ⚠ sem linha de costa OSM a < 2000 m; água interior/abrigada: Lagoa de Óbidos |
| `obidos-lagoon-sul` | 270 | 315 | **300** | 30 | curado v6 | ⚠ água interior/abrigada: Lagoa de Óbidos |
| `obidos-lagoon-foz` | 270 | 315 | **300** | 30 | curado v6 | ⚠ água interior/abrigada: Lagoa de Óbidos |
| `foz-arelho-beach` | 270 | 320 | **320** | 50 | OSM | ⚠ delta 50° > 45° face ao valor antigo |
| `praia-del-rey` | 270 | 325 | **325** | 55 | OSM | ⚠ delta 55° > 45° face ao valor antigo |
| `almagreira` | 270 | 340 | **340** | 70 | OSM | ⚠ delta 70° > 45° face ao valor antigo |
| `baleal` | 270 | 240 | **350** | 80 | curado v6 | ⚠ geometria ambígua (dobra 54°, 500 m vs 1 km 18°: ponta, enseada ou foz); outra costa a 149 m (margem oposta, ilhéu ou molhe); calculado a 110° do curado v6 (350°) |
| `supertubos` | 270 | 245 | **235** | 35 | curado v6 | ⚠ calculado a 25° da referência 220° |
| `foz-sizandro` | 270 | 300 | **300** | 30 | OSM |  |
| `coxos` | 270 | 250 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 55°, 500 m vs 1 km 4°: ponta, enseada ou foz) |
| `ribeira-ilhas` | 270 | 250 | **280** | 10 | curado v6 | ⚠ calculado a 32° da referência 280°; calculado a 32° do curado v6 (280°) |
| `empa` | 270 | 310 | **310** | 40 | OSM | ⚠ 500 m e 1 km divergem 19° (1 km: 290°); a 616 m de ribeira-ilhas (curado 280°) com 30° de diferença |
| `sao-lourenco` | 270 | 285 | **285** | 15 | OSM |  |
| `pedra-branca` | 270 | 270 | **270** | 0 | OSM |  |
| `sao-sebastiao` | 270 | 265 | **265** | 5 | OSM |  |
| `foz-lizandro` | 270 | 305 | **295** | 25 | OSM 1 km | ⚠ geometria ambígua (dobra 59°, 500 m vs 1 km 10°: ponta, enseada ou foz); aplicada a corda de 1 km (295°, corda/arco 0.858) |
| `praia-grande-sintra` | 270 | 285 | **285** | 15 | OSM |  |
| `adraga` | 270 | 295 | **295** | 25 | OSM |  |
| `guincho` | 270 | 290 | **280** | 10 | curado v6 | ⚠ outra costa a 384 m (margem oposta, ilhéu ou molhe) |
| `seixal-bay` | 0 | 40 | **0** | 0 | **mantido** | ⚠ geometria ambígua (dobra 99°, 500 m vs 1 km 0°: ponta, enseada ou foz); água interior/abrigada: estuário do Tejo (Baía do Seixal) |
| `praia-vitoria` | 270 | 100 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 56°, 500 m vs 1 km 14°: ponta, enseada ou foz) |
| `santa-catarina-terceira` | 270 | 105 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 53°, 500 m vs 1 km 10°: ponta, enseada ou foz); outra costa a 231 m (margem oposta, ilhéu ou molhe) |
| `parede` | 270 | 230 | **230** | 40 | OSM | ⚠ a 1308 m de carcavelos (curado 195°) com 35° de diferença |
| `carcavelos` | 270 | 205 | **195** | 75 | curado v6 |  |
| `nova-vaga` | 270 | 255 | **255** | 15 | OSM |  |
| `sao-joao-caparica` | 270 | 225 | **225** | 45 | OSM |  |
| `costa-caparica` | 270 | 220 | **255** | 15 | curado v6 | ⚠ geometria ambígua (dobra 50°, 500 m vs 1 km 7°: ponta, enseada ou foz); calculado a 31° da referência 250°; calculado a 36° do curado v6 (255°) |
| `fonte-telha` | 270 | 250 | **250** | 20 | curado v6 |  |
| `ponta-dos-corvos` | 225 | 10 | **225** | 0 | **mantido** | ⚠ outra costa a 287 m (margem oposta, ilhéu ou molhe); água interior/abrigada: estuário do Tejo (Seixal) |
| `trafaria` | 270 | 295 | **270** | 0 | **mantido** | ⚠ outra costa a 474 m (margem oposta, ilhéu ou molhe); água interior/abrigada: estuário do Tejo (Trafaria) |
| `cova-do-vapor` | 270 | 315 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 175°, 500 m vs 1 km 28°: ponta, enseada ou foz); água interior/abrigada: foz do Tejo (ponta da Cova do Vapor) |
| `praia-da-rainha` | 270 | 240 | **240** | 30 | OSM |  |
| `almoxarife` | 270 | 70 | **70** | 160 | OSM | ⚠ delta 160° > 45° face ao valor antigo |
| `lagoa-albufeira` | 270 |  | **260** | 10 | curado v6 | ⚠ sem linha de costa OSM a < 2000 m; água interior/abrigada: Lagoa de Albufeira |
| `foil-lagoa-albufeira` | 270 |  | **270** | 0 | **mantido** | ⚠ sem linha de costa OSM a < 2000 m; água interior/abrigada: Lagoa de Albufeira |
| `praia-lagoa-albufeira` | 270 | 270 | **270** | 0 | OSM |  |
| `troia` | 200 | 25 | **200** | 0 | **mantido** | ⚠ outra costa a 247 m (margem oposta, ilhéu ou molhe); água interior/abrigada: estuário do Sado (Tróia) |
| `comporta` | 270 | 300 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 131°, 500 m vs 1 km 10°: ponta, enseada ou foz) |
| `carvalhal-comporta` | 270 | 270 | **270** | 0 | OSM |  |
| `alqueva` | 270 |  | **270** | 0 | **mantido** | ⚠ sem linha de costa OSM a < 2000 m; água interior/abrigada: albufeira (interior) |
| `ilha-do-ermal` | 270 |  | **270** | 0 | **mantido** | ⚠ sem linha de costa OSM a < 2000 m; água interior/abrigada: albufeira (interior) |
| `melides` | 270 | 285 | **285** | 15 | OSM |  |
| `sines` | 270 | 175 | **175** | 95 | OSM | ⚠ delta 95° > 45° face ao valor antigo |
| `sao-torpes` | 270 | 250 | **250** | 20 | OSM |  |
| `mosteiros` | 270 | 5 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 64°, 500 m vs 1 km 49°: ponta, enseada ou foz); outra costa a 494 m (margem oposta, ilhéu ou molhe) |
| `porto-covo` | 270 | 265 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 162°, 500 m vs 1 km 2°: ponta, enseada ou foz); outra costa a 474 m (margem oposta, ilhéu ou molhe) |
| `monte-verde` | 0 | 340 | **340** | 20 | OSM |  |
| `santa-barbara` | 0 | 335 | **335** | 25 | OSM |  |
| `malhao` | 270 | 280 | **280** | 10 | OSM | ⚠ outra costa a 220 m (margem oposta, ilhéu ou molhe) |
| `milicias` | 180 | 190 | **190** | 10 | OSM |  |
| `vila-nova-milfontes` | 270 | 175 | **270** | 0 | **mantido** | ⚠ outra costa a 286 m (margem oposta, ilhéu ou molhe); água interior/abrigada: foz do rio Mira |
| `alteirinhos` | 270 | 295 | **295** | 25 | OSM | ⚠ 500 m e 1 km divergem 23° (1 km: 271°) |
| `agua-alto` | 180 | 225 | **225** | 45 | OSM | ⚠ outra costa a 454 m (margem oposta, ilhéu ou molhe) |
| `zambujeira` | 270 | 280 | **280** | 10 | OSM |  |
| `carvalhal` | 270 | 310 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 119°, 500 m vs 1 km 7°: ponta, enseada ou foz) |
| `odeceixe` | 270 | 290 | **290** | 20 | OSM | ⚠ outra costa a 184 m (margem oposta, ilhéu ou molhe); 500 m e 1 km divergem 24° (1 km: 268°) |
| `amoreira` | 270 | 280 | **280** | 10 | OSM |  |
| `monte-clerigo` | 270 | 300 | **300** | 30 | OSM |  |
| `arrifana` | 270 | 255 | **265** | 5 | curado v6 |  |
| `vale-figueiras` | 270 | 290 | **290** | 20 | OSM |  |
| `bordeira` | 270 | 310 | **310** | 40 | OSM |  |
| `amado` | 270 | 275 | **275** | 5 | OSM |  |
| `barriga` | 270 | 295 | **295** | 25 | OSM |  |
| `castelejo` | 270 | 300 | **300** | 30 | OSM |  |
| `luz` | 270 | 160 | **160** | 110 | OSM | ⚠ delta 110° > 45° face ao valor antigo |
| `burgau` | 180 | 170 | **170** | 10 | OSM | ⚠ 500 m e 1 km divergem 17° (1 km: 152°) |
| `salema` | 180 | 160 | **160** | 20 | OSM |  |
| `cordoama` | 270 | 305 | **305** | 35 | OSM |  |
| `ferragudo` | 180 | 200 | **180** | 0 | **mantido** | ⚠ geometria ambígua (dobra 83°, 500 m vs 1 km 2°: ponta, enseada ou foz); spot a 1115 m da costa; longe da costa e costa não recta: não aplicado |
| `vila-real-santo-antonio` | 180 |  | **180** | 0 | **mantido** | ⚠ sem linha de costa OSM a < 2000 m |
| `monte-gordo` | 180 | 180 | **180** | 0 | OSM |  |
| `praia-verde` | 180 | 165 | **165** | 15 | OSM |  |
| `altura` | 180 | 165 | **165** | 15 | OSM |  |
| `praia-rocha` | 270 | 205 | **205** | 65 | OSM | ⚠ delta 65° > 45° face ao valor antigo |
| `alvor` | 180 | 285 | **180** | 0 | **mantido** | ⚠ outra costa a 266 m (margem oposta, ilhéu ou molhe); água interior/abrigada: Ria de Alvor |
| `foil-alvor` | 270 | 285 | **270** | 0 | **mantido** | ⚠ outra costa a 266 m (margem oposta, ilhéu ou molhe); água interior/abrigada: Ria de Alvor |
| `lagos` | 180 | 150 | **160** | 20 | curado v6 |  |
| `lagos-wakepark` | 270 | 75 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 71°, 500 m vs 1 km 30°: ponta, enseada ou foz); água interior/abrigada: lago de wake park (interior) |
| `beliche` | 270 | 155 | **155** | 115 | OSM | ⚠ 500 m e 1 km divergem 21° (1 km: 178°); delta 115° > 45° face ao valor antigo |
| `martinhal` | 270 | 130 | **150** | 120 | curado v6 | ⚠ calculado a 22° do curado v6 (150°) |
| `barrinha-faro` | 180 | 210 | **180** | 0 | **mantido** | ⚠ água interior/abrigada: Ria Formosa |
| `fuseta` | 180 | 325 | **180** | 0 | **mantido** | ⚠ outra costa a 146 m (margem oposta, ilhéu ou molhe); água interior/abrigada: Ria Formosa |
| `ilha-faro` | 180 | 40 | **40** | 140 | OSM | ⚠ outra costa a 107 m (margem oposta, ilhéu ou molhe); delta 140° > 45° face ao valor antigo |
| `faro-mar` | 180 | 215 | **215** | 35 | OSM | ⚠ outra costa a 136 m (margem oposta, ilhéu ou molhe) |
| `culatra` | 180 | 150 | **150** | 30 | OSM | ⚠ outra costa a 236 m (margem oposta, ilhéu ou molhe) |
| `armona` | 180 | 190 | **190** | 10 | OSM | ⚠ 500 m e 1 km divergem 18° (1 km: 170°) |
| `ilha-tavira` | 180 | 145 | **145** | 35 | OSM | ⚠ outra costa a 497 m (margem oposta, ilhéu ou molhe) |
| `cabanas-tavira` | 180 | 150 | **180** | 0 | **mantido** | ⚠ outra costa a 245 m (margem oposta, ilhéu ou molhe); água interior/abrigada: Ria Formosa |
| `cacela-velha` | 180 | 170 | **180** | 0 | **mantido** | ⚠ outra costa a 244 m (margem oposta, ilhéu ou molhe); água interior/abrigada: Ria Formosa |
| `zavial` | 270 | 215 | **215** | 55 | OSM | ⚠ delta 55° > 45° face ao valor antigo |
| `tonel` | 270 | 255 | **235** | 35 | curado v6 | ⚠ outra costa a 459 m (margem oposta, ilhéu ou molhe); calculado a 53° da referência 200° |
| `anjos` | 270 | 10 | **10** | 100 | OSM | ⚠ outra costa a 83 m (margem oposta, ilhéu ou molhe); delta 100° > 45° face ao valor antigo |
| `ponta-delgada` | 180 | 150 | **150** | 30 | OSM | ⚠ outra costa a 419 m (margem oposta, ilhéu ou molhe); 500 m e 1 km divergem 16° (1 km: 168°) |
| `sao-vicente-madeira` | 270 | 325 | **325** | 55 | OSM | ⚠ delta 55° > 45° face ao valor antigo |
| `porto-da-cruz` | 90 | 55 | **55** | 35 | OSM |  |
| `paul-mar` | 270 | 225 | **225** | 45 | OSM |  |
| `jardim-mar` | 270 | 205 | **205** | 65 | OSM | ⚠ 500 m e 1 km divergem 17° (1 km: 223°); delta 65° > 45° face ao valor antigo |
| `ponta-sao-lourenco` | 90 | 195 | **90** | 0 | **mantido** | ⚠ geometria ambígua (dobra 63°, 500 m vs 1 km 9°: ponta, enseada ou foz); outra costa a 492 m (margem oposta, ilhéu ou molhe) |
| `ribeira-brava` | 90 | 245 | **90** | 0 | **mantido** | ⚠ geometria ambígua (dobra 119°, 500 m vs 1 km 15°: ponta, enseada ou foz); outra costa a 490 m (margem oposta, ilhéu ou molhe) |
| `funchal` | 90 | 220 | **220** | 130 | OSM | ⚠ delta 130° > 45° face ao valor antigo |
| `barra-aveiro` | 270 | 270 | **270** | 0 | OSM |  |
| `vila-cha` | 270 | 240 | **240** | 30 | OSM |  |
| `santa-cruz` | 270 | 305 | **305** | 35 | OSM |  |
| `consolacao` | 270 | 260 | **260** | 10 | OSM |  |
| `areia-branca` | 270 | 285 | **285** | 15 | OSM |  |
| `sao-martinho-porto` | 180 | 215 | **180** | 0 | **mantido** | ⚠ geometria ambígua (dobra 73°, 500 m vs 1 km 0°: ponta, enseada ou foz); outra costa a 488 m (margem oposta, ilhéu ou molhe); água interior/abrigada: baía fechada (concha de São Martinho) |
| `cave-ericeira` | 270 | 265 | **265** | 5 | OSM | ⚠ 500 m e 1 km divergem 20° (1 km: 284°) |
| `pescadores-ericeira` | 270 | 290 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 39°, 500 m vs 1 km 31°: ponta, enseada ou foz); outra costa a 477 m (margem oposta, ilhéu ou molhe) |
| `crazy-left` | 270 | 200 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 5°, 500 m vs 1 km 29°: ponta, enseada ou foz) |
| `meco` | 270 | 285 | **285** | 15 | OSM |  |
| `lagoa-santo-andre` | 270 | 285 | **270** | 0 | **mantido** | ⚠ spot a 1357 m da costa; água interior/abrigada: Lagoa de Santo André |
| `lagoa-sancha` | 270 |  | **270** | 0 | **mantido** | ⚠ sem linha de costa OSM a < 2000 m; água interior/abrigada: Lagoa da Sancha |
| `pessegueiro` | 270 | 150 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 114°, 500 m vs 1 km —°: ponta, enseada ou foz); outra costa a 369 m (margem oposta, ilhéu ou molhe) |
| `garrão` | 180 | 215 | **215** | 35 | OSM |  |
| `falesia` | 180 | 200 | **200** | 20 | OSM |  |
| `tres-irmaos` | 180 | 200 | **200** | 20 | OSM |  |
| `canavial` | 180 | 190 | **190** | 10 | OSM |  |
| `armacao-pera` | 180 | 200 | **200** | 20 | OSM |  |
| `mareta` | 180 | 165 | **165** | 15 | OSM | ⚠ a 711 m de tonel (curado 235°) com 70° de diferença |
| `machico` | 90 | 140 | **90** | 0 | **mantido** | ⚠ geometria ambígua (dobra 57°, 500 m vs 1 km 28°: ponta, enseada ou foz); outra costa a 448 m (margem oposta, ilhéu ou molhe) |
| `seixal-madeira` | 270 | 105 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 100°, 500 m vs 1 km 39°: ponta, enseada ou foz); outra costa a 78 m (margem oposta, ilhéu ou molhe) |
| `ponta-pargo` | 270 | 300 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 72°, 500 m vs 1 km 3°: ponta, enseada ou foz) |
| `madalena-mar` | 180 | 215 | **210** | 30 | OSM 1 km | ⚠ geometria ambígua (dobra 48°, 500 m vs 1 km 4°: ponta, enseada ou foz); aplicada a corda de 1 km (210°, corda/arco 0.878) |
| `calhetas` | 270 | 20 | **20** | 110 | OSM | ⚠ delta 110° > 45° face ao valor antigo |
| `ribeira-quente` | 180 | 175 | **180** | 0 | **mantido** | ⚠ geometria ambígua (dobra 121°, 500 m vs 1 km 11°: ponta, enseada ou foz) |
| `formosa-santa-maria` | 180 | 205 | **205** | 25 | OSM |  |
| `porto-martins` | 270 | 175 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 51°, 500 m vs 1 km 24°: ponta, enseada ou foz) |
| `cachorro-pico` | 270 | 320 | **320** | 50 | OSM | ⚠ 500 m e 1 km divergem 18° (1 km: 338°); delta 50° > 45° face ao valor antigo |
| `faja-cubres` | 270 | 45 | **45** | 135 | OSM | ⚠ delta 135° > 45° face ao valor antigo |
| `ofir-praia` | 270 | 270 | **270** | 0 | OSM |  |
| `mindelo` | 270 | 245 | **245** | 25 | OSM | ⚠ 500 m e 1 km divergem 16° (1 km: 259°) |
| `aterro` | 270 | 280 | **280** | 10 | OSM |  |
