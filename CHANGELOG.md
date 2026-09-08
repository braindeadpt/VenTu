# Changelog

Registo cronológico das alterações relevantes do VenTu. Novo no topo.
Datas em `YYYY-MM-DD`; SHAs de 7 caracteres referem-se a `main`.

## 2026-09-08 — Fixture e baselines em lockstep no recorder

`a645ba3c0` faz o workflow `record-visual-baselines` re-sincronizar a fixture
(`scripts/sync-visual-fixture.mjs`) a partir do build fresco **antes** de gravar,
para que uma mudança de FORMA dos dados (spot novo, ficheiro novo, schema) nunca
grave baselines contra uma fixture desactualizada. Fixture e baselines são
commitadas juntas (`f8481d8f8`: 194 ficheiros de fixture + 49 PNGs Linux),
portanto o pixel gate do CI valida exactamente a forma gravada.

## 2026-09-08 — Suite visual imune à deriva de dados (fixture commitada)

As capturas de regressão visual deixaram de depender dos dados do dia.
`a9af30a82` faz `gotoStable` servir **todos** os pedidos `/data/**` a partir de
uma fixture commitada em `tests/e2e/fixtures/data` (via `ventu_live=1`, o mesmo
mecanismo dos specs herméticos — as páginas com bake desde `847350f9c` nunca
faziam fetch e ignoravam o interceptor), bloqueia o service worker (que servia
`/data/*` do próprio cache, contornando o `page.route`) e espera o layout assentar
antes da captura. Provado com duas builds de dados genuinamente diferentes:
60/60 capturas byte-idênticas. Baselines Linux re-gravadas contra a fixture pelo
workflow `record-visual-baselines` (`0901ea4f2`); re-sincronização da fixture só
quando a FORMA dos dados mudar: `scripts/sync-visual-fixture.mjs`.

## 2026-09-07 — Mapa: teardown à prova de corridas + gramática única de proveniência

### Correcções e estabilidade do mapa (cadeia `8326a7bd0` → `8b5556e28`)

Uma classe de bug — frames de animação e listeners que sobrevivem ao desmonte
do mapa e disparam contra um renderer de canvas já destruído — foi corrigida e
fechada com testes em três camadas:

| SHA | Tipo | O quê |
|---|---|---|
| `8326a7bd0` | fix | Cancela os rAF aninhados do `onZoomEnd` (campo de correntes), guarda o `unload` das isóbatas, varre os overlays **antes** de `map.remove()` e acrescenta um guard de nível prototype no `Canvas._redraw`/`_update` — o ponto único que cobre qualquer caminho de agendamento |
| `31312ea5d` | test | Guard do canvas extraído para `leafletCanvasGuard.ts` + 6 testes unitários (o crash do CI: `Cannot read properties of undefined (reading 'save')`) |
| `fec329f76` | refactor | Varredura do teardown extraída para `mapOverlaySweep.ts` + 6 testes unitários da ordem remove-antes-de-destroy |
| `924fec773` | fix | Listeners do popup do spot ligados uma única vez (Leaflet reutiliza o elemento — acumulavam por abertura) |
| `51833a864` | test(e2e) | Spec `map-unmount-race`: desmonta o mapa do hero da homepage em mobile (PT→EN e zoom→pesquisa) e exige zero erros de página; falha com o erro original se os guards forem removidos |
| `5fe5d8f99` | ci | Counts esperados das duas suites de guard no `check-guard-test-counts.js` — tirar um guard faz o build falhar |
| `53940e3b7` | fix | Sheet mobile do `/mapa` acima do HUD (`z-1200`/`z-1201`): o botão «Ver spot» estava **morto** — a barra HUD tapava-o (hit-test provado com cliques CDP reais) |
| `56302bc2c` | ci | `map-unmount-race` entra no `test:e2e:core` (suite hermética que bloqueia o CI) |
| `8b5556e28` | test(e2e) | O teste mobile 02d agora **toca** em «Ver spot» com um pointer real e exige navegação — não só visibilidade |

### Proveniência unificada (`8e2dbacd3`)

Oito superfícies mostravam a origem dos números em oito dialectos (raios,
escalas de texto, opacidades de borda e mecanismos de detalhe diferentes).
Criada uma gramática e uma implementação únicas:

- **`src/lib/provenance.ts`** — tiers (`measured` | `adjusted` | `modeled` |
  `degraded`), ordem de eixos canónica (onda → vento → calibração → confiança
  → frescura), um conjunto de classes por tier, dois tamanhos.
- **`ProvenanceChip`** — o único chip: `title` no hover **e** popover
  portalizado (fecha com Escape/clique fora) para toque e teclado — o
  mecanismo que faltava aos chips que só tinham `title`.
- **`ProvenanceRow`** — espaçamento/alinhamento idênticos em todas as filas.
- Convertidos: `ConfidenceBadge`, `DataSourceBadge`, `ScoreWaveSourceBadge`,
  `ScoreWindSourceBadge`, `WaveCalibrationTag` (popover próprio substituído
  pelo chip partilhado). Selectores `data-*` existentes preservados via
  `chipAttrs`/`popoverAttrs`. `interactive={false}` (span estático) nos cards
  que são um link inteiro.
- **`BuoyLayerNotice`** alinhado com a gramática: só `down` é `degraded`
  (vermelho); `stale`/`no-key` são `adjusted`, e a homepage mostra a versão
  silenciosa (régua lateral) em vez de um painel cheio.
- **`SpotListCard`**: o score deixa de ser uma pílula de canto e passa a ser a
  âncora visual (numeral tabular + rótulo do tier); a imagem passa a faixa.

Verificação: `tsc --noEmit` limpo, eslint limpo, vitest 1395/1395. Os
contratos e2e (popover da calibração no comparador, TopNow, avisos de boias)
referenciam selectores e texto preservados.

**Nota:** esta cadeia muda de propósito o desenho das correntes/isóbatas e o
layout dos cards — as baselines visuais correspondentes ficaram desactualizadas
por desenho e precisam de re-gravação (workflow `record-visual-baselines`).
