# Auditoria mega — VenTu (design/UX-UI, mapa, APIs, cron jobs)

**Âmbito:** VenTu, integrado sobre `origin/main` actualizado.
**Data:** 30 de setembro de 2026.
**Método:** typecheck (app/worker/e2e), lint, testes unitários, guards de dados, build estático,
auditoria de rotas exportadas, suíte E2E em Chromium (desktop 1440 e mobile 390), sondagens HTTP
reais às APIs públicas e leitura dos workflows do GitHub Actions.

> **Não afirmo «100% funcional».** Tudo abaixo está medido localmente ou observado por
> leitura/sondagem read-only. O que não foi exercitado está em «Limites» e é exactamente o
> que exige validação humana. Nada foi enviado, escrito na BD, nem deployado.

---

## 1. Resumo

| Área | Estado | Evidência |
|---|---|---|
| Typecheck (app, worker, e2e) | OK | `tsc --noEmit` ×3 |
| Lint | OK | `eslint src tests scripts` |
| Testes unitários | **2219/2219** | 224 ficheiros |
| Build estático | OK | export completo, 5 locales |
| Rotas exportadas | OK | 2455 esperadas, 2455 geradas, 0 órfãs |
| E2E browser | OK | ver §6 |
| Acessibilidade | OK | axe sem violações serious/critical |
| APIs públicas | OK | 6 endpoints HTTP 200 com payload válido |
| Cron jobs | **1 P1, 1 P2** | ver §5 |

Corrigidos **6 defeitos de produto** e **2 defeitos de teste** que mascaravam o estado real.

---

## 2. Defeitos de produto corrigidos

### 2.1 Excepção JavaScript no menu «Camadas» ao redimensionar — P1
O handler de fecho estava ligado a `scroll` **e** `resize`:

```ts
if (popRef.current?.contains(e.target as Node)) return;  // e.target é Window no resize
```

O alvo de um `resize` é a `Window`, não um `Node`. O cast não valida em runtime, pelo que
`Node.contains(Window)` lançava `TypeError` e o menu **não fechava**, ficando flutuando
sobre o mapa. Corrigido com uma guarda real (`e.target instanceof Node`), com regressão E2E:
abrir → redimensionar → zero erros de página e popover fechado.

### 2.2 As correntes ignoravam a mudança de movimento reduzido — P1
`useMapCurrentsField` lia a preferência **só no mount**. Quem ligasse «reduzir movimento» com
o mapa aberto via manter as partículas. Passou a usar o hook partilhado (que já reage a
`change`), e a ler as cores do tema por frame como o vento. Regressão E2E: animar → `reduce`
**pára** de pintar frames.

### 2.3 Previsão expirada apresentada como «Agora» — P1 (honestidade do dado)
`findCurrentHourIndex` devolvia sempre o slot mais próximo, mesmo com todo o dataset
expirado, e a interface marcava-o «Agora». Com dados de 23–29 de Setembro e o relógio a
30, a página mostrava «Agora 23:00» — um score actual num timestamp antigo.

Passou a existir `findCoveredHourIndex` (devolve −1 quando o instante não está na série) e
`nowResolved` distingue «ainda não medi» de «medi e não está coberto». Fora de cobertura a
pill passa a dizer «Sem previsão para agora» (pt/en/es/de/fr) e deixa de atribuir
correções observadas à hora errada.

### 2.4 Distância entre horas errada nas fronteiras de mês — P2
`(y*372 + m) * 31 * 24 + d * 24 + h` dava **96 h** entre 28 de Fevereiro e 1 de Março
(em vez de 24) e 24 h entre 31 e 1 (em vez de 31). O índice «mais próximo» caía errado
em qualquer forecast que cruzasse essas fronteiras. Agora usa `Date.UTC` (calendário real,
sem interpretar a timestamp sem offset no fuso do dispositivo).

### 2.5 Controlo interactivo aninhado nos marcadores do mapa — P1 (a11y)
O badge «+N» era `role="button" tabindex="-1"` **dentro** do marcador, que o Leaflet marca
como `role="button" tabindex="0"`. Isso é a violação `nested-interactive` do axe: o scan de
`/pt/mapa/` no tema ocean falhava com 11 nós.

O badge passou a `aria-hidden` — announce um botão seria mentira, porque o zoom só é
alcançável por clique. A contagem entra no nome acessível do marcador
(«Nazaré · Mais 23 spots perto — ampliar»), verificado no browser: o «+23» continua
visível e clicável, e o scan axe passa.

### 2.6 Silenciar erros de página no helper de auditoria — P2
`audit-utils.ts` ignorava três padrões de `pageerror` (incluindo `leaflet`), o que deixava
passar erros de JS reais em auditorias de rota. Removido: agora as excepções são
reportadas.

---

## 3. Telegram: falhas reais, confirmadas com mocks

### 3.1 P1 — mensagens válidas perdidas
**(a) Token rejeitado por atraso do cron.** O TTL é 30 min
(`supabase/supabase-telegram.sql`), mas a validade comparava-se com `Date.now()` — a hora
de **processamento** — em vez de `upd.message.date`, a hora de **envio**. Com o poll a cada
30 min, quem clicasse «Começar» dentro da janela válida era rejeitado. Passa a usar o
timestamp da mensagem, recusando datas ausentes, mensagens antes da emissão, depois do
expiry ou no futuro (falha fechada).

**(b) Updates perdidos para sempre.** Em `scripts/lib/telegram.js`, um erro de BD no
`getOffset`/`find` era ignorado e o offset avançava na mesma — um pico de erro do Supabase
descartava updates sem recuperação. Agora falha alto: o offset só é gravado quando **todas**
as operações foram bem-sucedidas.

### 3.2 P2
`telegram-poll.js` devolvia exit code 0 para erros não classificados, fazendo o GitHub
marcar o run como sucesso. `ops-audit.js` acusava um job sem `timeout` que o tem — o parser
procurava numa janela de ±6 linhas e o `timeout-minutes: 20` está ~5 linhas abaixo, por
entre um comentário. Passou a analisar o bloco do job inteiro.

**Impacto observado:** o cron do Telegram correu **55 de 288 vezes previstas (19%)**.
⚠️ Isto é infraestrutura, não lógica — **a correcção só entra em vigor com um deploy.**

---

## 4. Cobertura de rotas

O inventário de browser cobria 14 rotas e não incluía `diretorio/`, `ferramentas/`,
`fontes/`, `passaporte/`, `conta/`, callbacks de auth nem as páginas de detalhe. O
`check-export-routes` provava que as 2455 rotas existem no export, mas **não que abrem no
browser**. `discover-routes.js` passou a derivar grupos do export e o spec foi alargado.
É a diferença entre «a rota foi gerada» e «a rota responde».

---

## 5. APIs

Sondagens GET reais (30/09 15:14 UTC) — todas HTTP 200 com payload válido:

| Endpoint | HTTP | Latência |
|---|---|---|
| IH marés | 200 | 138 ms |
| IH boias (EDR) | 200 | 38 ms |
| IPMA avisos | 200 | 153 ms |
| Radar | 200 | 234 ms |
| Open-Meteo | 200 | 290 ms |
| Observação Porto | 200 | 2331 ms |

Quota Open-Meteo a **1904/10000 = 19%**. Metadados de produção `full`, obs com 1,5 h
(limiar 3 h). **Worker `/health` devolve 404 em produção** — precisa de deploy humano, e há
drift entre o worker no repositório e o deployado. Alertas: 5 de 9 execuções (56%).

A contagem de execuções conta **triggers, não sucesso**.

---

## 6. Defeitos de teste corrigidos (não de produto)

**Teste das camadas fechava o popover a meio.** `mega-audit.interactions` clicava cada
toggle com `force: true`, que salta a verificação de acção e clica no centro do elemento
mesmo sobreposto. O `pointerdown` resultante caía fora do popover e o `MapLayersMenu` —
correctamente, por ser um clique exterior — fechava-o, abortando o ciclo no 9.º toggle de
14. Verificado: com clique real o popover fica aberto. O `force` foi removido.

**Testes dependentes do relógio.** Vários specs usavam previsões reais já expiradas com o
relógio actual, pelo que a janela de 48 h ficava com 1 hora de largura. Ficaram
determinísticos com um relógio alinhado ao dataset real — **sem alterar um único dado**.
`about-wave-bias` também: a célula Copernicus-ES tem agora duas linhas (mais boias), e o
teste saltava só se não houvesse *nenhuma*.

**Helper da HUD do mapa** saía em silêncio se ainda não encontrasse a superfície, sem abrir
os filtros; passa a decidir pelo viewport.

---

## 7. Defeitos pré-existentes do `main` (NÃO corrigidos aqui)

### 7.1 `ipma-radar-carousel.spec.ts` está partido — 13 de 28 casos
O spec procura `button[aria-label="Radar IPMA"]`, atributo que **já não existe em lado
nenhum do código**: o radar passou a ser uma linha do menu «Camadas»
(`[data-map-radar-toggle]` com `aria-pressed`). Prova num worktree limpo de `origin/main`:
o spec pede o atributo, `grep` no `src` devolve zero. Detalhes e receita de correcção em
[`2026-09-30-ipma-radar-spec-partido.md`](2026-09-30-ipma-radar-spec-partido.md).

Uma migração a meio foi tentada e **revertida de propósito** (levou 13→7, mas deixaria a
suíte a vermelho com o trabalho por acabar).

### 7.2 Flakiness de carga
`data-sources`, `map-chrome` e `map-v3-markers` falham esporadicamente com 4–6 workers
(timeout de navegação) e passam isolados. Não mexi em produção sem causa demonstrada.

### 7.3 Baselines de pixel são Linux-only
Não gravei baseline Darwin para fabricar verde — isso mascararia a CI visual.

---

## 8. Limites — o que NÃO foi verificado

1. **Produção não foi tocada.** As correções de Telegram, `/health` e a cadência de 19% só
   entram em vigor com um deploy.
2. **`/health` 404** e o drift do worker só se resolvem com deploy.
3. **Autenticação com sessão iniciada, e-mails e escrita na BD não foram exercitados** —
   só GET a APIs públicas.
4. **Baselines de pixel** não comparáveis em macOS; a CI Linux valida o visual.
5. **7.1 e 7.2 acima** ficam por resolver.

---

## 9. Melhorias de UX/UI propostas

### Alta prioridade

**Legenda de incerteza na régua.** As 48 h desenham-se com o mesmo peso visual, quer
venham de observação quer de previsão com 6 dias de intervalo. A correcção 2.3 dá a base
(sabemos quando o dado expira); um degradê de confiança por hora devolveria mais confiança
do que qualquer polimento de cor.

**Estado de dado velho visível e accionável.** A página avisa que a previsão expirou mas
não diz há quanto tempo nem o que fazer. Um chip discreto («actualizado há 6 h») com link
para a fonte transforma uma suspeita em informação.

**Prioridade ao «Agora».** A acção mais importante da página está enterrada nos controlos
da HUD em mobile; um alvo persistente de 44 px no rodapé do painel de condições resolveria.

### Média prioridade

**Densidade da régua em ecrãs < 400 px.** Com ~7,5 px por hora o eixo é legível mas frágil.
Mostrar só mudanças de dia mais uma hora de referência daria menos ruído.

**Legenda do campo de correntes.** As correntes animadas não dizem o que significam; um
rótulo curto ao primeiro toque evita que se leiam como decoração.

**Estados vazios com próximo passo.** Onde falta dado (uma boia sem EDR, um spot sem
Ensemble), dizer o que falta e quando volta — não esconder o cartão.

### Baixa prioridade, alto retorno

**Foco visível unificado** entre o popover do menu «Camadas» e o menu «Mais» da régua.

**Preferência de densidade** (compacto / confortável, com `prefers-reduced-data` como
default) em vez de decidir por breakpoint.

**Micro-animações de confirmação** ao estabilizar o arrasto da régua (120 ms), respeitando
`reduced motion`.

**Largura reservada nos números** que mudam de 1 para 3 dígitos, com `tabular-nums`.

---

## 10. Como revalidar

```bash
npx tsc --noEmit && npx tsc --noEmit -p worker && npx tsc --noEmit -p tests/e2e
npm run lint
npm test
node scripts/check-export-routes.js
npm run build:e2e
PLAYWRIGHT_BROWSERS_PATH=0 PLAYWRIGHT_PORT=4187 npx playwright test --grep-invert 'matches baseline'
```

Nota: `serve` com `nohup`/`setsid` **morre** quando a sessão termina. Lançar com
`spawn(..., { detached: true, stdio: ['ignore', log, log] })` e `unref()` — foi o que
causou falhas de ligação enganosas na auditoria.
