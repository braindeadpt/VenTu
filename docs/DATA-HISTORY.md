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

> 2026-09-25 (continuação): o `forecast-skill.json` ganha `byLead` (skill por
> faixa de horizonte de lead, por boia e global — ver CONTEXT.md) — ~+1 KB no
> ficheiro do report, bem dentro do orçamento de 0,5 MB em
> `check-payload-budgets.js`, e sem impacto na contagem de ficheiros.

> 2026-09-23: o guard disparou a **302 ficheiros** — 72 frames de radar
> acumulados (o manifesto só usa 12). Causa: uma corrida que falhava a meio do
> fetch deixava os PNG escritos sem correr o prune (que só existia no fim).
> Corrigido no próprio pipeline: `fetch-ipma-radar.js` faz agora uma **limpeza
> defensiva antes do fetch**, deixando só o que o manifesto actual referencia —
> uma corrida falhada é limpa pela seguinte, em vez de acumular no git.

> 2026-10-07: o guard disparou a **64,7 MB** (283 ficheiros) —
> `public/data/sat-mtg/frames/` tinha **46 frames / 36,6 MB** com o manifest a
> usar 4. Mesma classe de bug do radar a 23–24 set: (1) o
> `scripts/push-data-update.sh` faz checkout de `origin/main` e `cp -a` por
> cima, por isso os frames que o `fetch-mtg-ir.py` podava voltavam do origin
> em cada commit do bot; (2) o script só podava no caminho «frames novos» — o
> caminho «tudo já em disco» e as corridas mortas a meio (Data Tailor
> pendurado) não podavam nada. Corrigido no pipeline, sem mexer no tecto:
> - `push-data-update.sh` esvazia `radar/frames` **e** `sat-mtg/frames` antes
>   do `cp -a` (as removidas entram como deleções no `git add -f`);
> - `fetch-mtg-ir.py`: retenção explícita (`MAX_FRAMES = 12`, a janela do
>   carrossel), limpeza defensiva antes do fetch (fica só o que o manifest
>   actual referencia) e poda em todos os caminhos que escrevem o manifest;
> - frames mais leves: saída a 0,025°/px (1400×960, perto do nativo FCI IR
>   sobre a Ibéria) e WebP q70 + `alpha_quality` 70 — **~0,26–0,31 MB/frame**
>   em vez de ~0,81–1,0 MB; 12 frames ≈ 3,6 MB;
> - sub-orçamento no guard: `sat-mtg/frames` ≤ 12 ficheiros / 5 MB. Aperta,
>   não alarga — uma fuga nesta pasta falha com o nome dela antes de comer a
>   folga do total.
>
> Depois da correcção: **241 ficheiros / 29,1 MB**. Atenção à folga: o resto
> de `public/data` (sem satélite) passou de 24,1 MB (23 set) para ~28 MB — os
> 12 frames MTG cabem (~31,5 MB no pior caso), mas o próximo corte tem de vir
> do lado dos forecasts (`forecasts/` e `forecasts.json` pesam ~11 MB cada;
> ver «Médio prazo»), não de subir o tecto.

> 2026-10-08: entra `public/data/sea-grid.json` (vento + ondulação em grelha
> de 0,5° × 55 h para o /mapa, `scripts/build-sea-grid.js`). Um só ficheiro
> reescrito (sem arquivo nem frames), **~160 KB** (bytes quantizados em
> base64, ~80 KB gzip) — +1 ficheiro e +0,16 MB na árvore. Só é regenerado
> quando tem ≥ 5,5 h, por isso entra no histórico ~4×/dia (~0,6 MB/dia de
> blobs, contra ~1,1 MB por corrida do `forecasts.json`). Tecto próprio de
> 0,5 MB em `check-payload-budgets.js`.

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
