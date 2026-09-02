# IH_API_KEY — chave gratuita do Instituto Hidrográfico (boias Datawell + Fugro Wavescan)

A camada **`observedWave`** (altura / período / direcção de onda **medidos**, não previstos)
depende de `IH_API_KEY`. Sem ela a pipeline continua a correr e os spots continuam a ter
score e previsão — só ficam sem a onda observada (ver [Degradação graciosa](#degradação-graciosa)).

Fonte oficial: [FAQ do IH — Serviço de dados: boias Datawell Waverider](https://faq.hidrografico.pt/books/hidrografico/page/servico-de-dados-boias-datawell-waverider)

---

## As duas famílias de boias

A pipeline consome **duas** famílias de boias do IH, ambas pela mesma lista OGC API
(sem key) e pelo mesmo endpoint de séries `getDatawellData` (com key):

| Família | Colecção OGC | Boias activas hoje | Detalhe |
|---|---|---|---|
| **Datawell Waverider** | `buoys_datawell` | Leixões (4), Sines (19), Faro (20), Caniçal (33) | Documentado no FAQ oficial; `last_sea` nas estações |
| **Fugro Oceanor Wavescan** | `buoys_Fugro_oceanor_wavescan` | **Nazaré Costeira (2, CSA88/2, WMO 6200199)** | Só posições documentadas em metadados; `last_data` nas estações |

A boia **Nazaré Costeira** é a única Fugro activa e é de longe a mais próxima dos spots
da Costa de Prata (nazaré a 12 km, são-martinho-porto a 7 km, baleal a 23 km) — já está
no `spotMapping` de `ih-buoys.json` (36 spots). Se a `getDatawellData` servir a família
Fugro, o `observedWave` desses spots passa a vir desta boia.

> **Estado da verificação (2026-09-02, key real):** a pergunta está respondida — a
> `getDatawellData` **não serve a família Fugro**. Testes com a key: Datawell 4 (Leixões),
> 19 (Sines), 20 (Faro) e 33 (Caniçal) devolvem leituras frescas (≤ 2 h); as estações
> Fugro 2 (CSA88/2, Nazaré Costeira), 1010 (ZLT1) e 1011 (ZLT2) devolvem **série vazia
> numa janela de 48 h** — sem erro HTTP, sem 401/403. Não é falta de NRT: a OGC API
> keyless `buoys_Fugro_oceanor_wavescan/items` mostra as três com
> `last_data = 2026-09-02T11:00` (vivas à hora do teste). Estações vivas + série vazia =
> o endpoint não cobre esta família. Consequência: a boia 2 não tem observedWave mesmo
> com key — a Costa de Prata (36 spots mapeados) fica sem observedWave de origem IH; o
> merge degrada graciosamente (não inventa leituras — ver observedWaveMerge.js) e a
> fallback WMO ES (Cabo Silleiro 6200084) cobre os spots do NW dentro do alcance.

---

---

## O que a key desbloqueia

| | |
|---|---|
| Endpoint | `https://supportserver1.hidrografico.pt/geodata/buoys/getDatawellData` |
| Autenticação | header `X-API-KEY` |
| Argumentos | `startDate`, `endDate` (`YYYY-MM-DDTHH:MM:SS.SSSZ`, UTC) e `stationId` (int) |
| Janela máxima | **15 dias** por pedido (o script pede só 24 h) |
| Devolve | `hm0` (altura significativa, m), `tp` (período de pico, s), `thtp` (direcção de pico, °), `hmax` (m), `temp` (SST, °C) + flags `qc_*` |
| Custo | **Grátis** (finalidade: métricas de utilização do IH) |

No código: `scripts/lib/ihBuoys.js` (parse + mapping spot→boia + frescura 3 h) →
`scripts/fetch-ih-buoys.js` → `public/data/ih-buoys.json` →
`scripts/merge-observations.mjs` → `conditions.json[spot].observedWave`.

---

## Passo 1 — Obter a key (grátis, por e-mail)

Envia um pedido para **`cedencia.dados@hidrografico.pt`** (o processo não é automático;
é uma resposta manual do IH — tipicamente em dias úteis).

Exemplo de e-mail (adaptar):

> **Assunto:** Pedido de API key — Hidrográfico+ (boias Datawell Waverider)
>
> Exmo. Instituto Hidrográfico,
>
> Venho solicitar uma API key (X-API-KEY) gratuita para acesso ao serviço
> `getDatawellData` (parâmetros de agitação marítima das boias Datawell Waverider),
> conforme descrito no FAQ Hidrográfico+.
>
> Utilização: projeto open-source de condições para desportos náuticos em Portugal
> (ventu.surf) — consulta de altura, período e direcção de onda NRT, baixo volume
> (1 pedido por boia ativa, de hora em hora).
>
> Obrigado.

Guarda a key num local seguro. **Não** a comites nem a exponhas no frontend.

---

## Passo 2 — Testar a key localmente

```bash
# a) com curl (ex.: boia 19 = Sines; janela de 24 h em UTC)
IH_API_KEY=xxxxxxxx \
  curl -s -H "X-API-KEY: $IH_API_KEY" \
  "https://supportserver1.hidrografico.pt/geodata/buoys/getDatawellData?startDate=2026-08-13T00:00:00.000Z&endDate=2026-08-14T00:00:00.000Z&stationId=19"

# b) ou com o teste de ponta a ponta do projecto (recomendado)
IH_API_KEY=xxxxxxxx npm run buoys:test-key
# variante com boia específica (4 = Leixões, 19 = Sines):
IH_API_KEY=xxxxxxxx node scripts/test-ih-api-key.js --station 4
```

O teste (`scripts/test-ih-api-key.js`) faz a cadeia completa: estações via OGC API (sem key)
→ `getDatawellData` com a key → parse de `hm0/tp/thtp/hmax/temp` → verificação de frescura.
Exit `0` = PASS; exit `1` = FAIL (com diagnóstico no output).

### Verificar a família Fugro Wavescan (Nazaré Costeira)

**Sem a key** podes já ver o pedido exacto que a pipeline faz (modo `--url`, imprime
o curl com a URL da boia Fugro 2 — Nazaré Costeira — e nunca toca a rede):

```bash
node scripts/test-ih-api-key.js --family fugro --url
```

Cola o URL impresso num curl com a tua key (a key viaja no header, nunca no URL):

```bash
curl -s -H 'Accept: application/json' -H 'X-API-KEY: A_TUA_KEY_AQUI' \
  'https://supportserver1.hidrografico.pt/geodata/buoys/getDatawellData?startDate=...&endDate=...&stationId=2'
```

Com a key, prova-se a resposta à pergunta «a `getDatawellData` serve também a Fugro?»
num único comando:

```bash
IH_API_KEY=xxxxxxxx node scripts/test-ih-api-key.js --family fugro
# ou, focado só na Nazaré Costeira:
IH_API_KEY=xxxxxxxx node scripts/test-ih-api-key.js --station 2
```

- **Exit 0 com «Sem leituras na janela»/série vazia na boia 2** → resultado real de
  2026-09-02: a key é válida e a API aceita o pedido, mas **não devolve séries da família
  Fugro** — as estações 2/1010/1011 aparecem vivas na OGC keyless (`last_data` recente)
  e mesmo assim a série vem vazia. A API é só Datawell (`getDatawellData` documentado
  para as Waverider): a Costa de Prata fica sem observedWave de origem IH e o gate de
  verificação trata isto como **aviso**, não falha.
- **Exit 1 com «Erro na boia 2: HTTP …»** → problema de autenticação/permissão: validar a
  key (Passo 2). Não significa Fugro ausente — a ausência da família é silenciosa (série
  vazia) e detecta-se pelo aviso do gate.
- **Fallback**: para os spots do NW, a WMO ES (Cabo Silleiro 6200084, Copernicus sem key)
  cobre os spots dentro do alcance — registado em docs/BACKLOG.md.

O campo `family` (`datawell`/`fugro`) é gravado em cada estação de `ih-buoys.json` —
podes confirmar a origem de cada boia no ficheiro gerado.

### Verificar o observedWave da Nazaré no conditions.json

A cadeia completa (key → `getDatawellData` → `ih-buoys.json` → merge → conditions.json)
é coberta pelo teste **`scripts/lib/__tests__/observedWaveNazareE2E.test.js`**, que corre
sem key e sem rede: a fixture injeta no `ih-buoys.json` a leitura fresca da boia 2 (o
que a API devolveria com a key) e o merge real anexa o `observedWave` ao spot `nazare`.

> **Um comando só:** `npm run buoys:test-key` corre agora o diagnóstico da key **e** este
teste de cadeia em sequência (`&&`) — com a key presente obténs `exit 0` só se ambos
passarem. Sem key (ou com key rejeitada), o diagnóstico falha cedo (`exit 1`) e a
verificação de cadeia nem chega a correr. Para correr só a cadeia:

```bash
npx vitest run scripts/lib/__tests__/observedWaveNazareE2E.test.js
```

Esperado (teste 1, leitura fresca):

```json
{
  "waveHeight": 2.4, "wavePeriod": 13.2, "waveDirection": 315,
  "stationName": "CSA88/2", "stationArea": "Boia Nazaré Costeira",
  "distanceKm": 12.1, "source": "ih-buoy",
  "observedAt": "<agora>"
}
// + observedWaveMeta: { winner: "ih", reason: "ih-only" }
```

O teste 2 confirma o gate de frescura: leitura com >3 h → **sem** `observedWave` (a UI
nunca apresenta dado velho como ao vivo). Com a key real, o passo 4 acima (`npm run
data:update`) produz exactamente este resultado em `public/data/conditions.json`, e o
teste e2e de key (`--family fugro` / `--station 2`) valida o elo que o teste unitário
simula.

---

## Passo 3 — Criar o secret `IH_API_KEY` no GitHub

O workflow `update-data.yml` lê `${{ secrets.IH_API_KEY }}` no passo
**"Fetch IH buoy data (Datawell Waverider)"**. Sem o secret, esse passo corre sem key
(estações sim, séries de onda não) e o `observedWave` fica vazio.

1. Abrir o repositório no GitHub → **Settings**
2. Menu lateral: **Secrets and variables → Actions**
3. Botão **New repository secret**
4. **Name:** `IH_API_KEY`
5. **Secret:** colar a key (sem espaços à volta)
6. **Add secret**

CLI (equivalente, depois de teres a key no clipboard):

```bash
gh secret set IH_API_KEY
# cola a key, Enter, Ctrl+D
gh workflow run api-keys.yml
gh workflow run update-data.yml
```

> **Nota:** como é um secret *repository-level*, funciona nos workflows do repo. Se um dia
> moveres a pipeline para outro repo, tens de o recriar lá.

Para desenvolvimento local, podes pôr a key num ficheiro `.env.local` e correr
`export $(grep IH_API_KEY .env.local | xargs)` antes dos comandos — o script lê apenas a
variável de ambiente `IH_API_KEY` (ver `.env.example`).

---

## Passo 4 — Teste de ponta a ponta

### Local (com a key)

```bash
# 1) Gera o ih-buoys.json com as séries de onda
IH_API_KEY=xxxxxxxx npm run buoys:fetch

# 2) Confirma que a camada de onda ficou activa
node -e "const d=require('./public/data/ih-buoys.json');console.log('hasWaveData:',d.hasWaveData,'· buoys com latest:',Object.values(d.stations).filter(s=>s.latest).map(s=>s.idEst+' '+s.name).join(', '))"

# 3) Merge para conditions.json (precisa de conditions.json actual)
npm run data:update   # ou: npm run conditions:update && npm run obs:update

# 4) Confirma o observedWave num spot junto a uma boia (ex.: Leixões)
node -e "const c=require('./public/data/conditions.json');const s=Object.values(c).find(x=>x.observedWave);console.log(JSON.stringify(s.observedWave,null,2))"
```

Esperado: `hasWaveData: true`, boias ativas com `latest`, e em `conditions.json` algo como:

```json
{
  "waveHeight": 1.8,
  "wavePeriod": 11,
  "waveDirection": 250,
  "maxWaveHeight": 2.6,
  "waterTemp": 19.1,
  "stationName": "CSA83/1D",
  "stationArea": "Sines",
  "distanceKm": 40,
  "observedAt": "2026-08-14T12:30:00Z",
  "source": "ih-buoy"
}
```

### GitHub Actions (produção)

1. Repo → **Actions** → workflow **Update VenTu Data** → **Run workflow**
2. `force_mode`: `full` → **Run workflow**
3. Seguir o job **update-conditions** → passo **Fetch IH buoy data (Datawell Waverider)**:
   - esperado: `Wave snapshots: N ok, 0 failed` e `hasWaveData: yes`
   - se aparecer `ℹ️ IH_API_KEY not set`, o secret não está criado/visível (volta ao Passo 3)
4. Logo a seguir, o passo **Verify IH buoy layer** corre automaticamente (só com
   key) e **falha o job** só se `hasWaveData !== true` **ou se nenhuma das boias
   Datawell Leixões (4), Sines (19), Faro (20) e Caniçal (33) tiver leitura
   fresca** — o sinal honesto de «a camada não está a funcionar». A boia Fugro 2
   (Nazaré Costeira) é agora **aviso** (a `getDatawellData` não serve a família
   Fugro, provado em 2026-09-02): se algum dia passar a servir, o aviso some.
5. Depois do run, confirmar no commit gerado que `public/data/ih-buoys.json` tem
   `"hasWaveData": true` e pelo menos um de `stations["4"|"19"|"20"|"33"].latest`
   (Leixões/Sines/Faro/Caniçal).

### Validação automática semanal (api-keys.yml)

O workflow **`.github/workflows/api-keys.yml`** corre **semanalmente** (segunda
06:00 UTC, + `workflow_dispatch` manual) e diagnostica **todas** as dependências
externas com key — IH, MeteoAlarm, Ecowitt e Resend. O passo do IH corre o
**`buoys:test-key` combinado** (`node scripts/buoys-test-key.js`): estações OGC →
`getDatawellData` com a key → parse `hm0/tp/thtp/hmax/temp` → frescura, e, só se
o diagnóstico passar, a **cadeia hermética Fugro → observedWave da Nazaré**
(`observedWaveNazareE2E`):

- **Key configurada mas inválida/expirada** → o job **falha** (o Actions fica
  vermelho sozinho quando a key expira);
- **Key ausente** → só um `::warning::` (não bloqueia; o observedWave fica
  desactivado até criares o secret).

Sem acção manual: depois do Passo 3, o próprio GitHub valida a key todas as
semanas — basta ir a **Actions** → **API Keys Health** para ver o resultado.

---

## Diagnóstico

| Sintoma | Causa provável | Acção |
|---|---|---|
| `IH_API_KEY not set` | Secret ausente no GitHub / variável não exportada | Passo 3; `echo ${#IH_API_KEY}` local para confirmar |
| `HTTP 401` / `403 for buoy N` | Key inválida ou com espaço/linha extra | Revalidar key (Passo 2, curl) e recriar o secret |
| `apiKeyStatus: "unauthorized"` no `ih-buoys.json` | Key rejeitada pela API — o workflow **falhou cedo de propósito** (exit 1) com alerta Telegram (transição, uma vez) e `::error::` no log | Recriar o secret `IH_API_KEY` e re-correr `workflow_dispatch`; o alerta não repete a cada run horário |
| `Sem leituras na janela` | Boia inactiva, sem NRT, ou backend IH em baixo | Testar outra boia (`--station`); ver `last_sea` na estação |
| `observedWave` ausente num spot | Leitura > 3 h, distância à boia > 200 km, ou spot sem boia mapeada | Ver `spotMapping` em `ih-buoys.json` |
| `hasWaveData: false` | Key presente mas nenhuma boia devolveu leituras | Correr `buoys:test-key` para isolar |
| Datas “estranhas” | O serviço devolve UTC (`+0000`) | Comparar sempre com UTC |
| Janela vazia | Pedido de mais de 15 dias | O script pede só 24 h; nunca exceder 15 dias |

---

## Degradação graciosa (sem key / IH em baixo)

- Sem `IH_API_KEY`, `fetch-ih-buoys.js` escreve as estações + posições + `last_sea`/`last_pos`
  (sem `latest`); `hasWaveData: false`; o merge salta o `observedWave` (nunca inventa leituras).
- Em falha do IH, o script mantém o ficheiro anterior e sai com 0 — a pipeline (Open-Meteo,
  observações, avisos) nunca fica bloqueada.
- **Excepção — key rejeitada (HTTP 401/403):** o script falha cedo (exit 1). Escreve o
  `ih-buoys.json` com `apiKeyStatus: "unauthorized"` (o UI/`pipeline-meta` distingue de
  `no-key`/`down`), emite `::error::` e envia alerta Telegram (só na transição, via
  `OPS_TELEGRAM_CHAT_ID` + `TELEGRAM_BOT_TOKEN`; sem eles faz dry-run). O workflow
  `update-data.yml` pára neste passo em vez de publicar dados sem a camada observedWave.
- `validate-generated-data.js` trata `ih-buoys.json` como warn-only (nunca bloqueia o deploy).
---

## Licença das boias ondógrafo — CC BY-NC e uso comercial

Registo do processo IH n.º 0191_2026 (email do Instituto Hidrográfico): «A licença de utilização dos dados das boias do Instituto Hidrográfico é CC -BY-NC.»

- Os dados das boias ondógrafo (camada `observedWave`; séries de onda com `IH_API_KEY`) são **CC BY-NC 4.0** (<https://creativecommons.org/licenses/by-nc/4.0/>), não CC BY — a página /fontes declara-os separadamente.
- Atribuição obrigatória (ficha de metadados da Rede de Boias Datawell Waverider, `0205ed82-a085-4432-98f5-ff0326c4d4de`): Instituto Hidrográfico, Administração dos Portos da Região Autónoma da Madeira e Associação para o Estudo do Ambiente Insular.
- Questão em aberto: o roteiro do VenTu inclui usos comerciais (directório de escolas, B2B, patrocínios, marketplace). CC BY-NC exclui o uso comercial, pelo que o uso comercial da camada observedWave exigirá uma licença diferente a negociar com o IH. Este documento regista o facto e a questão — não constitui avaliação legal.
