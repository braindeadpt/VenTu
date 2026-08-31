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

> **Estado da verificação (2026-08-15):** o FAQ oficial documenta `getDatawellData` só
> para as **Datawell Waverider**; os metadados Fugro só publicam posições (WMS/WFS/OGC).
> Reconfirmado ao vivo sem key: (1) o servidor de séries
> `supportserver1.hidrografico.pt/geodata/buoys` responde **401 «Invalid API KEY» em todos
> os caminhos** — incluindo `/openapi.json` e `/swagger`, por isso nem o spec que listaria
> as estações servidas é legível sem key; (2) a OGC API keyless tem 44 colecções, mas
> **nenhuma de observações de onda** (só posições de boias; `tide_obs_nrt` e `hfr_*` são
> marés e correntes HF-radar) — a única rota para séries de onda é mesmo `getDatawellData`.
> A resposta definitiva («a API serve ou não a Fugro 2?») só é verificável com a key — o
> modo `--url` abaixo imprime o pedido exacto para o verificares com um curl. A fallback
> WMO (Copernicus, sem key) **não** cobre a 6200199 (só 6201077/79 PT + as 5 ES) — sem a
> key da IH, a Nazaré fica sem observedWave.

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

- **Exit 0** → a API serve a Fugro: o `observedWave` da Costa de Prata passa a funcionar
  com a key (merge-observations anexa a boia 2 aos 36 spots mapeados).
- **Exit 1 com «Erro na boia 2: HTTP …»** → a `getDatawellData` rejeita a família Fugro
  (a API é só Datawell): a Nazaré fica sem observedWave mesmo com key — nesse caso o
  caminho honesto é a fallback WMO ES (Cabo Silleiro 6200084) para os spots do NW.
- **Exit 1 com «Sem leituras na janela»** → a key funciona e a API aceita a boia 2, mas
  não há NRT na janela — ver `last_data` na estação (OGC API, sem key) para confirmar
  que a boia reporta.

O campo `family` (`datawell`/`fugro`) é gravado em cada estação de `ih-buoys.json` —
podes confirmar a origem de cada boia no ficheiro gerado.

### Verificar o observedWave da Nazaré no conditions.json

A cadeia completa (key → `getDatawellData` → `ih-buoys.json` → merge → conditions.json)
é coberta pelo teste **`scripts/lib/__tests__/observedWaveNazareE2E.test.js`**, que corre
sem key e sem rede: a fixture injeta no `ih-buoys.json` a leitura fresca da boia 2 (o
que a API devolveria com a key) e o merge real anexa o `observedWave` ao spot `nazare`.

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
4. Depois do run, confirmar no commit gerado que `public/data/ih-buoys.json` tem
   `"hasWaveData": true`.

---

## Diagnóstico

| Sintoma | Causa provável | Acção |
|---|---|---|
| `IH_API_KEY not set` | Secret ausente no GitHub / variável não exportada | Passo 3; `echo ${#IH_API_KEY}` local para confirmar |
| `HTTP 401` / `403 for buoy N` | Key inválida ou com espaço/linha extra | Revalidar key (Passo 2, curl) e recriar o secret |
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
- `validate-generated-data.js` trata `ih-buoys.json` como warn-only (nunca bloqueia o deploy).
