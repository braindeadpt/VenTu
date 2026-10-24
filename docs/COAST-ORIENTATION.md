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
| curado v6 | os 21 spots de `spotEditorial.json` (os 19 da maquete, mais as variantes da Lagoa de Óbidos: `obidos-lagoon-sul` e `foz-arelho`) | o `praiaVirada` revisto à mão: o motor antigo e o v6 passam a dizer o mesmo |
| OSM | geometria limpa | o calculado (500 m) |
| OSM 1 km | 500 m ambíguo, mas a corda de 1 km é limpa (corda/arco ≥ 0,85) | o calculado a 1 km |
| **manual** | spot da lista `REVISAO_MANUAL` com valor fixado à mão em `VALOR_MANUAL` (`beliche` 230° e `coxos` 280°; na passagem de Peniche, 24/10: `consolacao` 260°, `lagide` 345°, `baleal-sul` 345°, `molhe-leste` 250°, `sao-martinho-porto` 315° e `foil-foz-arelho` 300°; todos aprovados pelo Pedro) | o valor fixado: o recálculo mantém-no |
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
   - ou fixar o valor à mão: pô-lo em `REVISAO_MANUAL` e em `VALOR_MANUAL` (passa a `origem: manual`);
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

Numa terceira passagem (23/10) o Pedro mandou pins do Google Maps para 20
spots do Norte, da Costa Vicentina/Alentejo, do Algarve e de Lisboa/Sintra; as
coordenadas são o pin arredondado a 4 casas e a orientação foi recalculada com
cache nova (`overpass.openstreetmap.fr`, um spot de cada vez). Em Fão/Esposende
ficam só `fao` (praia, surf e kite), `esposende` (rio, só kite) e
`esposende-praia` (praia oceânica, surf/foil/bodyboard). Foram removidos
`ofir`, `ofir-praia`, `foil-fao-cavado`, `foil-esposende-piscinas`, `povoa-varzim`, `castelo-neiva`, `garrão`, `sines`. `beliche`, `porto-covo` e
`vila-praia-ancora` ficam **mantidos** (geometria ambígua no pin novo), o que
devolve o valor de antes da #178 (no `beliche`, 155° → 270°; calculado 230°):
candidatos a revisão manual.

Numa quarta passagem (23/10) entraram 2 spots novos, com coordenadas do Pedro:
`arvore` (Praia de Árvore, Vila do Conde, 41.3296,-8.7391; surf, foil e kite,
spot diferente de `azurara`, que não mudou) e `vale-figueiros-sines` (Praia de
Vale Figueiros, a sul de Sines, 37.8958,-8.7975; surf e bodyboard; o slug leva
`-sines` para não se confundir com `vale-figueiras`, em Aljezur). A orientação
dos dois foi calculada com cache nova (`overpass.openstreetmap.fr`): `arvore`
265° e `vale-figueiros-sines` 250° (OSM). O `beliche` passa a **manual**: 230°
(o calculado no pin novo), aprovado pelo Pedro; está em `REVISAO_MANUAL` e em
`VALOR_MANUAL`, e o recálculo mantém-no.

Numa quinta passagem (23/10) foram corrigidos os spots da Ericeira (fontes: OSM
e pins do Pedro no Google Maps). `crazy-left` estava em cima da Praia do Sul e
passa para a onda a sul de Coxos (38.99666,-9.42606); `cave-ericeira` passa para
38.99446,-9.42489; `pedra-branca` (pin do Pedro), `empa`, `sao-sebastiao`,
`coxos`, `foz-lizandro` e `pescadores-ericeira` foram acertados (147 m a 883 m;
os dois primeiros moveram-se 4,4 km e 3,0 km). `foz-lizandro` fica com `bestWind` 'N, NW'
(kite com a Nortada). `ribeira-ilhas` e `sao-lourenco` estavam certos. Entraram
4 spots novos: `praia-norte-ericeira` (Praia do Norte), `praia-sul-ericeira`
(Praia do Sul), `sao-juliao` (Praia de São Julião, pin do Pedro; não confundir
com o Forte de São Julião, em Carcavelos) e `calada` (Praia da Calada). A
orientação dos 12 foi recalculada com cache nova (`overpass.openstreetmap.fr`,
um spot de cada vez): `crazy-left` 270° (mantido), `cave-ericeira`
250°, `pedra-branca` 270° (mantido), `empa` 270°,
`sao-sebastiao` 280°, `coxos` 230°, `foz-lizandro` 295°,
`pescadores-ericeira` 270° (mantido), `praia-norte-ericeira`
275°, `praia-sul-ericeira` 275°, `sao-juliao` 280° e
`calada` 285° (OSM 1 km).

Na mesma passagem, `lagoa-albufeira` (a lagoa, Sesimbra) estava ~3,2 km a
leste do sítio certo; passa para o pin do Pedro «Praia da Lagoa de Albufeira
(Lagoa)» (38.501,-9.140 → 38.50878,-9.17599). Os
desportos não mudam. É água interior (`REVISAO_MANUAL`) e curado v6, por isso a
orientação fica 260° (curado; o calculado, 270°, é o da costa
oceânica a 621 m, não o da lagoa). `foil-lagoa-albufeira` continua nas
coordenadas antigas (não pedido).

Numa passagem seguinte (24/10) foi revisto o troço Peniche – Foz do Arelho
(OSM via `overpass.openstreetmap.fr`, Nominatim, guias de surf e escolas de
kite). 11 pins mudam: `consolacao` (estava no centróide do polígono gigante da
praia, 1,6 km a norte; passa para a direita a sul do forte), `praia-del-rey`
(estava no golfe), `areia-branca`, `sao-martinho-porto` (estava na vila; passa
para a água da baía), `foil-foz-arelho` (passa para o spot interior da lagoa,
junto à Escola de Vela, onde há fundo para foil), `foz-arelho` (margem norte da
lagoa, Praia das Rolotes), `obidos-lagoon`, `obidos-lagoon-sul` (estuário do
lado do Bom Sucesso), `baleal` (passa a ser o Cantinho da Baía), `supertubos` e
`almagreira`. Entram 4 spots: `lagide`, `molhe-leste`, `gamboa` (Peniche de
Cima) e `baleal-sul` (a baía do Baleal). `obidos-lagoon-foz` foi fundido em
`foz-arelho`, que herda o editorial (curado 300°), a foto e o
`conditionsSource` da lagoa. Orientações: `baleal` 300° (curado; os 350° antigos punham a
Nortada on-shore no Cantinho), `sao-martinho-porto` 315° (manual; a baía abre a
NW), `foz-arelho` 300° (curado) e `foil-foz-arelho` 300° (manual), `areia-branca`
275°, `almagreira` 330° e `praia-del-rey` 325° (OSM nos pins novos), `consolacao`
260° (manual: no pin novo a geometria é ambígua e voltaria aos 270° antigos),
`lagide` 345°, `baleal-sul` 345° e `molhe-leste` 250° (manual, valores aprovados pelo
Pedro) e `gamboa` 30° (OSM).

## Resultado (OSM de 2026-07-15T15:22:01Z)

- 185 spots, dos quais **126 mudam** de valor face ao antes da #178.
- Origem: OSM 107, OSM 1 km 2, curado 21, manual 8, mantido 47.
- 109 spots ficam marcados para revisão.
- Spots a 270°: 141 → 40. Os que ficam têm 270° calculado, curado, ou mantido com motivo.

| spot | antes | calculado | depois | Δ | origem | revisão |
|---|---:|---:|---:|---:|---|---|
| `moledo` | 270 | 280 | **270** | 0 | curado v6 |  |
| `vila-praia-ancora` | 270 | 240 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 57°, 500 m vs 1 km 6°: ponta, enseada ou foz) |
| `afife` | 270 | 280 | **280** | 10 | OSM |  |
| `amorosa` | 270 | 255 | **255** | 15 | OSM |  |
| `cabedelo` | 270 | 210 | **265** | 5 | curado v6 | ⚠ calculado a 55° do curado v6 (265°) |
| `foil-cabedelo` | 270 | 210 | **270** | 0 | **mantido** | ⚠ água interior/abrigada: rio Lima (barra) |
| `cabedelo-wakepark` | 270 | 215 | **270** | 0 | **mantido** | ⚠ spot a 1033 m da costa; água interior/abrigada: rio Lima (wake park); longe da costa e costa não recta: não aplicado |
| `rodanho` | 270 | 265 | **265** | 5 | OSM |  |
| `esposende` | 270 | 280 | **275** | 5 | curado v6 | ⚠ água interior/abrigada: foz do Cávado (rio/mar) |
| `esposende-praia` | 270 | 275 | **275** | 5 | OSM |  |
| `fao` | 270 | 235 | **235** | 35 | OSM | ⚠ a 1141 m de esposende (curado 275°) com 40° de diferença |
| `apulia` | 270 | 240 | **240** | 30 | OSM |  |
| `azurara` | 270 | 225 | **225** | 45 | OSM |  |
| `arvore` | 270 | 265 | **265** | 5 | OSM |  |
| `leca-palmeira` | 270 | 275 | **275** | 5 | OSM |  |
| `matosinhos` | 270 | 220 | **255** | 15 | curado v6 | ⚠ calculado a 34° do curado v6 (255°) |
| `cabedelo-douro` | 270 | 260 | **260** | 10 | OSM |  |
| `marina-afurada-foil` | 270 | 255 | **270** | 0 | **mantido** | ⚠ spot a 1318 m da costa; água interior/abrigada: rio Douro (marina); longe da costa e costa não recta: não aplicado |
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
| `foz-arelho` | 270 | 310 | **300** | 30 | curado v6 | ⚠ spot a 1121 m da costa; água interior/abrigada: Lagoa de Óbidos |
| `foil-foz-arelho` | 270 |  | **300** | 30 | **manual** | ⚠ sem linha de costa OSM a < 2000 m; água interior/abrigada: Lagoa de Óbidos |
| `obidos-lagoon` | 270 |  | **300** | 30 | curado v6 | ⚠ sem linha de costa OSM a < 2000 m; água interior/abrigada: Lagoa de Óbidos |
| `obidos-lagoon-sul` | 270 | 310 | **300** | 30 | curado v6 | ⚠ água interior/abrigada: Lagoa de Óbidos |
| `foz-arelho-beach` | 270 | 320 | **320** | 50 | OSM | ⚠ delta 50° > 45° face ao valor antigo |
| `praia-del-rey` | 270 | 325 | **325** | 55 | OSM | ⚠ delta 55° > 45° face ao valor antigo |
| `almagreira` | 270 | 330 | **330** | 60 | OSM | ⚠ delta 60° > 45° face ao valor antigo |
| `lagide` | 345 | 5 | **345** | 0 | **manual** | ⚠ outra costa a 319 m (margem oposta, ilhéu ou molhe); água interior/abrigada: reef do Lagide (Baleal): 345° fixado à mão (332° no pico, 353° na praia); a 690 m de baleal (curado 300°) com 45° de diferença |
| `baleal` | 270 | 290 | **300** | 30 | curado v6 | ⚠ outra costa a 368 m (margem oposta, ilhéu ou molhe) |
| `baleal-sul` | 345 | 340 | **345** | 0 | **manual** | ⚠ água interior/abrigada: baía do Baleal: 345° fixado à mão (areal da baía 344–346°); a 1404 m de baleal (curado 300°) com 45° de diferença |
| `gamboa` | 30 | 30 | **30** | 0 | OSM | ⚠ a 1946 m de supertubos (curado 235°) com 155° de diferença |
| `supertubos` | 270 | 245 | **235** | 35 | curado v6 | ⚠ calculado a 26° da referência 220° |
| `molhe-leste` | 250 | 215 | **250** | 0 | **manual** | ⚠ outra costa a 393 m (margem oposta, ilhéu ou molhe); água interior/abrigada: molhe leste do porto de Peniche: 250° fixado à mão (a costa local segue o molhe) |
| `foz-sizandro` | 270 | 300 | **300** | 30 | OSM |  |
| `coxos` | 270 | 230 | **280** | 10 | **manual** | ⚠ 500 m e 1 km divergem 25° (1 km: 257°); água interior/abrigada: baía dos Coxos (Ericeira): 280° fixado à mão (a costa local dá 230°, a 1 km 257°) |
| `ribeira-ilhas` | 270 | 250 | **280** | 10 | curado v6 | ⚠ calculado a 32° da referência 280°; calculado a 32° do curado v6 (280°) |
| `empa` | 270 | 270 | **270** | 0 | OSM |  |
| `sao-lourenco` | 270 | 285 | **285** | 15 | OSM |  |
| `calada` | 270 | 280 | **285** | 15 | OSM 1 km | ⚠ geometria ambígua (dobra 46°, 500 m vs 1 km 3°: ponta, enseada ou foz); aplicada a corda de 1 km (285°, corda/arco 0.875) |
| `pedra-branca` | 270 | 275 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 47°, 500 m vs 1 km 10°: ponta, enseada ou foz) |
| `sao-sebastiao` | 270 | 280 | **280** | 10 | OSM |  |
| `praia-norte-ericeira` | 270 | 275 | **275** | 5 | OSM | ⚠ outra costa a 487 m (margem oposta, ilhéu ou molhe) |
| `praia-sul-ericeira` | 270 | 275 | **275** | 5 | OSM | ⚠ 500 m e 1 km divergem 20° (1 km: 253°) |
| `foz-lizandro` | 270 | 295 | **295** | 25 | OSM |  |
| `sao-juliao` | 270 | 280 | **280** | 10 | OSM |  |
| `praia-grande-sintra` | 270 | 295 | **295** | 25 | OSM |  |
| `adraga` | 270 | 295 | **295** | 25 | OSM |  |
| `guincho` | 270 | 290 | **280** | 10 | curado v6 | ⚠ outra costa a 384 m (margem oposta, ilhéu ou molhe) |
| `seixal-bay` | 0 | 40 | **0** | 0 | **mantido** | ⚠ geometria ambígua (dobra 99°, 500 m vs 1 km 0°: ponta, enseada ou foz); água interior/abrigada: estuário do Tejo (Baía do Seixal) |
| `praia-vitoria` | 270 | 100 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 56°, 500 m vs 1 km 14°: ponta, enseada ou foz) |
| `santa-catarina-terceira` | 270 | 105 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 53°, 500 m vs 1 km 10°: ponta, enseada ou foz); outra costa a 231 m (margem oposta, ilhéu ou molhe) |
| `parede` | 270 | 195 | **195** | 75 | OSM | ⚠ delta 75° > 45° face ao valor antigo |
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
| `lagoa-albufeira` | 270 | 270 | **260** | 10 | curado v6 | ⚠ água interior/abrigada: Lagoa de Albufeira |
| `foil-lagoa-albufeira` | 270 | 270 | **270** | 0 | **mantido** | ⚠ água interior/abrigada: Lagoa de Albufeira |
| `praia-lagoa-albufeira` | 270 | 270 | **270** | 0 | OSM |  |
| `troia` | 200 | 25 | **200** | 0 | **mantido** | ⚠ outra costa a 247 m (margem oposta, ilhéu ou molhe); água interior/abrigada: estuário do Sado (Tróia) |
| `comporta` | 270 | 300 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 131°, 500 m vs 1 km 10°: ponta, enseada ou foz) |
| `carvalhal-comporta` | 270 | 270 | **270** | 0 | OSM |  |
| `alqueva` | 270 |  | **270** | 0 | **mantido** | ⚠ sem linha de costa OSM a < 2000 m; água interior/abrigada: albufeira (interior) |
| `ilha-do-ermal` | 270 |  | **270** | 0 | **mantido** | ⚠ sem linha de costa OSM a < 2000 m; água interior/abrigada: albufeira (interior) |
| `melides` | 270 | 285 | **285** | 15 | OSM |  |
| `sao-torpes` | 270 | 250 | **250** | 20 | OSM | ⚠ outra costa a 494 m (margem oposta, ilhéu ou molhe) |
| `vale-figueiros-sines` | 270 | 250 | **250** | 20 | OSM | ⚠ outra costa a 218 m (margem oposta, ilhéu ou molhe) |
| `mosteiros` | 270 | 5 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 64°, 500 m vs 1 km 49°: ponta, enseada ou foz); outra costa a 494 m (margem oposta, ilhéu ou molhe) |
| `porto-covo` | 270 | 270 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 62°, 500 m vs 1 km 5°: ponta, enseada ou foz) |
| `monte-verde` | 0 | 340 | **340** | 20 | OSM |  |
| `santa-barbara` | 0 | 335 | **335** | 25 | OSM |  |
| `malhao` | 270 | 275 | **275** | 5 | OSM | ⚠ outra costa a 425 m (margem oposta, ilhéu ou molhe) |
| `milicias` | 180 | 190 | **190** | 10 | OSM |  |
| `vila-nova-milfontes` | 270 | 175 | **270** | 0 | **mantido** | ⚠ outra costa a 286 m (margem oposta, ilhéu ou molhe); água interior/abrigada: foz do rio Mira |
| `alteirinhos` | 270 | 290 | **290** | 20 | OSM | ⚠ 500 m e 1 km divergem 19° (1 km: 272°) |
| `agua-alto` | 180 | 225 | **225** | 45 | OSM | ⚠ outra costa a 454 m (margem oposta, ilhéu ou molhe) |
| `zambujeira` | 270 | 280 | **280** | 10 | OSM |  |
| `carvalhal` | 270 | 310 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 119°, 500 m vs 1 km 7°: ponta, enseada ou foz) |
| `odeceixe` | 270 | 290 | **290** | 20 | OSM | ⚠ outra costa a 184 m (margem oposta, ilhéu ou molhe); 500 m e 1 km divergem 24° (1 km: 268°) |
| `amoreira` | 270 | 280 | **280** | 10 | OSM |  |
| `monte-clerigo` | 270 | 315 | **315** | 45 | OSM |  |
| `arrifana` | 270 | 255 | **265** | 5 | curado v6 |  |
| `vale-figueiras` | 270 | 290 | **290** | 20 | OSM |  |
| `bordeira` | 270 | 310 | **310** | 40 | OSM |  |
| `amado` | 270 | 275 | **275** | 5 | OSM |  |
| `barriga` | 270 | 295 | **295** | 25 | OSM |  |
| `castelejo` | 270 | 305 | **305** | 35 | OSM |  |
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
| `beliche` | 270 | 230 | **230** | 40 | **manual** | ⚠ geometria ambígua (dobra 53°, 500 m vs 1 km 13°: ponta, enseada ou foz); água interior/abrigada: enseada do Beliche (Sagres): 230° fixado à mão |
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
| `vila-cha` | 270 | 255 | **255** | 15 | OSM |  |
| `santa-cruz` | 270 | 305 | **305** | 35 | OSM |  |
| `consolacao` | 270 | 215 | **260** | 10 | **manual** | ⚠ geometria ambígua (dobra 48°, 500 m vs 1 km 38°: ponta, enseada ou foz); água interior/abrigada: Consolação (ponta do forte): 260° fixado à mão (geometria ambígua no pin) |
| `areia-branca` | 270 | 275 | **275** | 5 | OSM |  |
| `sao-martinho-porto` | 180 | 300 | **315** | 135 | **manual** | ⚠ água interior/abrigada: baía fechada (concha de São Martinho): 315° fixado à mão |
| `cave-ericeira` | 270 | 250 | **250** | 20 | OSM | ⚠ a 877 m de ribeira-ilhas (curado 280°) com 30° de diferença |
| `pescadores-ericeira` | 270 | 235 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 56°, 500 m vs 1 km 6°: ponta, enseada ou foz) |
| `crazy-left` | 270 | 275 | **270** | 0 | **mantido** | ⚠ geometria ambígua (dobra 50°, 500 m vs 1 km 14°: ponta, enseada ou foz) |
| `meco` | 270 | 285 | **285** | 15 | OSM |  |
| `lagoa-santo-andre` | 270 | 285 | **270** | 0 | **mantido** | ⚠ spot a 1357 m da costa; água interior/abrigada: Lagoa de Santo André |
| `lagoa-sancha` | 270 |  | **270** | 0 | **mantido** | ⚠ sem linha de costa OSM a < 2000 m; água interior/abrigada: Lagoa da Sancha |
| `pessegueiro` | 270 | 260 | **260** | 10 | OSM |  |
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
| `mindelo` | 270 | 245 | **245** | 25 | OSM | ⚠ 500 m e 1 km divergem 16° (1 km: 259°) |
| `aterro` | 270 | 280 | **280** | 10 | OSM |  |
