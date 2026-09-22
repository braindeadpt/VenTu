# Histórico de dados (`public/data`) — política e orçamento

> Item **M8** da auditoria. Este documento fixa os números, explica porque o
> repositório cresce e o que falta fazer. O guard
> [`scripts/check-data-history-budget.js`](../scripts/check-data-history-budget.js)
> corre no job `quality` do CI e falha se a árvore trackeada passar o tecto.

## Estado (2026-09-22)

| Grupo | Ficheiros | Peso |
|---|---:|---:|
| `public/data/forecasts/` (1 por spot, reescrito a cada corrida) | 185 | 10,3 MB |
| `public/data/radar/frames/` (PNG do radar IPMA) | 38 | 1,9 MB |
| Restantes JSON de topo (`conditions.json`, `directory.json`, …) | 32 | ~14 MB |
| **Total trackeado** | **256** | **26 MB** |

**Orçamento actual (CI):** 300 ficheiros / 32 MB — folga para o crescimento
normal, falha antes de se tornar um problema de histórico.

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
