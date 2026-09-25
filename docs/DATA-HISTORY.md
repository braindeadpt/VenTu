# Histórico de dados (`public/data`) — política e orçamento

> Item **M8** da auditoria. Este documento fixa os números, explica porque o
> repositório cresce e o que falta fazer. O guard
> [`scripts/check-data-history-budget.js`](../scripts/check-data-history-budget.js)
> corre no job `quality` do CI e falha se a árvore trackeada passar o tecto.

## Estado (2026-09-23)

| Grupo | Ficheiros | Peso |
|---|---:|---:|
| `public/data/forecasts/` (1 por spot, reescrito a cada corrida) | 184 | 9,7 MB |
| `public/data/radar/frames/` (PNG do radar IPMA — carrossel + `ipma-radar.png`) | 13 | 0,9 MB |
| Restantes JSON de topo (`conditions.json`, `directory.json`, …) | 34 | 13,4 MB |
| **Total trackeado** | **231** | **24,1 MB** |

**Orçamento actual (CI):** 300 ficheiros / 32 MB — folga para o crescimento
normal, falha antes de se tornar um problema de histórico.

> 2026-09-25: a banda ensemble P10/P50/P90 passa a ser gravada em cada linha
> horária (`ens`, ver CONTEXT.md) — medido no payload real de 185 × 168 h:
> `forecasts.json` 9,73 → **10,81 MB** e a árvore `public/data/` ~+1,1 MB. Não
> muda a contagem de ficheiros (mesmos 185 por-spot), só o peso: a folga do
> orçamento desce de ~6 MB para ~5 MB, e o orçamento de 12 MB de
> `forecasts.json` em `check-payload-budgets.js` fica a 10% do limite — razão
> pela qual o campo é o array compacto de 8 números e não seis chaves nominais
> (essas custariam +1,93 MB).

> 2026-09-23: o guard disparou a **302 ficheiros** — 72 frames de radar
> acumulados (o manifesto só usa 12). Causa: uma corrida que falhava a meio do
> fetch deixava os PNG escritos sem correr o prune (que só existia no fim).
> Corrigido no próprio pipeline: `fetch-ipma-radar.js` faz agora uma **limpeza
> defensiva antes do fetch**, deixando só o que o manifesto actual referencia —
> uma corrida falhada é limpa pela seguinte, em vez de acumular no git.

## Porque cresce

`scripts/push-data-update.sh` corre `git add -f public/data/` a cada ~30 min e
commita tudo o que mudou. Consequências:

1. **Os ficheiros de forecast não aumentam de contagem** (185 spots, sempre o
   mesmo conjunto) mas são **reescritos em cada corrida** — o custo é no
   *histórico* (novos blobs por commit), não na árvore.
2. **Os frames de radar são PNG** e não deltaizam bem: ~13 ficheiros novos por
   corrida entram no histórico como blobs novos.
3. O `-f` (força) ignora o `.gitignore`, pelo que qualquer ficheiro que o
   pipeline escreva em `public/data/` entra no repo — foi assim que aconteceu o
   incidente dos `.backup` de 17 MB/run (já documentado no `.gitignore`).

## Decisão e próximos passos

Curto prazo (feito):
- Orçamento + guard no CI (este documento + script), para o crescimento
  anormal aparecer cedo e com mensagem accionável.
- **Limpeza defensiva dos frames** (`fetch-ipma-radar.js`): antes do fetch,
  remove tudo o que o manifesto actual não referencia — auto-curativa para
  corridas falhadas (2026-09-23).
- Excepções do `.gitignore` revistas (`!public/data/.gitkeep`,
  `!public/data/community-tips.json`; o resto é gerido pelo pipeline).

Médio prazo (PR próprio, fora deste lote — requer mexer no pipeline):
- **Janela de retenção dos frames de radar**: manter as últimas 24 h e apagar
  os anteriores no próprio pipeline (`scripts/fetch-ipma-radar.js`), antes do
  `git add`. É o ganho maior em blobs binários e não muda nada no site.
- **Forecasts fora do git**: publicar `forecasts/` como artefacto de release
  (ou object storage) e manter no repo apenas um índice compacto; o build
  passa a descarregar o artefacto. Requer coordenação com o deploy estático.

Enquanto esses PRs não existem, o orçamento do CI é a rede de segurança: se
saltares o tecto, o caminho é cortar retenção (frames) antes de aumentar o
número — não subir o limite.
