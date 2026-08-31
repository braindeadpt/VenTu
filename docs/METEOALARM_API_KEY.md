# METEOALARM_API_KEY — token gratuito do MeteoAlarm (EUMETNET)

O **MeteoAlarm** é o agregador europeu de avisos meteorológicos severos (rede EUMETNET —
o IPMA é o membro português). Serve de **fonte secundária de avisos**: quando a API
open-data do IPMA está em baixo, `fetch-ipma-warnings.js` cai automaticamente para o
MeteoAlarm e escreve `warnings.json` com `source: 'meteoalarm'`. A UI (secção de avisos
na página de spot, Dawn Patrol, badge no mapa/cards) funciona sem alterações — só o
rótulo da fonte muda para «MeteoAlarm (EUMETNET)».

Sem o token, a pipeline continua a correr normalmente com o IPMA como única fonte
(ver [Degradação graciosa](#degradação-graciosa)).

Fonte oficial: [MeteoAlarm API Portal](https://api.meteoalarm.org/) · [FAQ do EDR](https://api.meteoalarm.org/edr/v1/faq)

---

## O que o token desbloqueia

| | |
|---|---|
| API | OGC API — Environmental Data Retrieval (EDR) em `https://api.meteoalarm.org/edr/v1` |
| Autenticação | header `Authorization: Bearer <token>` (verificado no [endpoint de autenticação](https://api.meteoalarm.org/edr/v1/authentication)) |
| Endpoint usado | `GET /edr/v1/collections/warnings/locations/PT?active=true&language=pt-PT` |
| Devolve | GeoJSON FeatureCollection de avisos activos para Portugal; cada feature tem um bbox da área e um `links` com o payload **CAP Oasis 1.2** (URL assinado, descarregável sem auth) |
| Formato normalizado | `warnings.json` com o **mesmo shape do IPMA** + `source: 'meteoalarm'`; tipos mapeados (`awareness_type` → Agitação Marítima, Vento, Trovoada, …) |
| Custo | **Grátis** (registo para reutilizadores) |

No código: `scripts/lib/meteoalarmWarnings.js` (EDR + parse CAP + point-in-bbox
spot→aviso) → `scripts/fetch-meteoalarm-warnings.js` (CLI, também usado como fallback
dentro de `fetch-ipma-warnings.js`) → `public/data/warnings.json`.

---

## Passo 1 — Obter o token (grátis, por formulário)

1. Abrir [https://api.meteoalarm.org/register](https://api.meteoalarm.org/register)
2. Preencher o formulário de pedido de acesso (organização / finalidade — um projecto
   aberto de condições de surf/kite em Portugal serve; é um processo manual de revisão)
3. Receber o **API token** por e-mail após aprovação (tal como a key do IH, não é instantâneo)

Guarda o token num local seguro. **Não** o comites nem o exponhas no frontend.

---

## Passo 2 — Testar o token localmente

```bash
# a) com curl (listagem pública não precisa de token; a query de avisos exige):
METEOALARM_API_KEY=xxxxxxxx \
  curl -s -H "Authorization: Bearer $METEOALARM_API_KEY" \
  "https://api.meteoalarm.org/edr/v1/collections/warnings/locations/PT?active=true&language=pt-PT"

# b) ou com o teste de ponta a ponta do projecto (recomendado)
METEOALARM_API_KEY=xxxxxxxx npm run warnings:test-key
```

O teste (`scripts/test-meteoalarm-api-key.js`) faz a cadeia completa: query EDR com o
token → parse do CAP Oasis 1.2 do primeiro aviso activo → `buildMeteoAlarmPayload`
sobre os 185 spots reais (verifica `spotWarnings` e `source: 'meteoalarm'`).
Exit `0` = PASS; exit `1` = FAIL (com diagnóstico no output).

---

## Passo 3 — Criar o secret `METEOALARM_API_KEY` no GitHub

O workflow `update-data.yml` lê `${{ secrets.METEOALARM_API_KEY }}` no passo
**"Fetch IPMA weather warnings (MeteoAlarm fallback)"**. Sem o secret, esse passo corre
só com IPMA (sem fallback).

1. Abrir o repositório no GitHub → **Settings**
2. Menu lateral: **Secrets and variables → Actions**
3. Botão **New repository secret**
4. **Name:** `METEOALARM_API_KEY`
5. **Secret:** colar o token (sem espaços à volta)
6. **Add secret**

> **Nota:** o fallback só é exercitado quando o IPMA falha — é normal o log diário
> não mostrar MeteoAlarm. Para forçar o teste local, corre `npm run warnings:meteoalarm`.

Para desenvolvimento local, podes pôr o token num ficheiro `.env.local` e correr
`export $(grep METEOALARM_API_KEY .env.local | xargs)` antes dos comandos — o script lê
apenas a variável de ambiente `METEOALARM_API_KEY` (ver `.env.example`).

---

## Passo 4 — Teste de ponta a ponta

### Fallback forçado (simula IPMA em baixo)

```bash
# 1) Escreve warnings.json a partir do MeteoAlarm directamente:
METEOALARM_API_KEY=xxxxxxxx npm run warnings:meteoalarm

# 2) Confirma a fonte e o mapeamento por spot:
node -e "const d=require('./public/data/warnings.json');console.log('source:',d.source,'· warnings:',d.warnings.length,'· spots:',Object.keys(d.spotWarnings).length)"

# 3) Fallback automático dentro do fetch do IPMA (roda sempre em CI):
METEOALARM_API_KEY=xxxxxxxx node scripts/fetch-ipma-warnings.js
```

Esperado: `source: meteoalarm`, `warnings` com a mesma shape do IPMA
(`areaCode`, `areaLabel`, `type`, `level`, `text`, `startTime`, `endTime`, `relevant`).
Exemplo de payload:

```json
{
  "source": "meteoalarm",
  "fetchedAt": "2026-08-14T10:00:00.000Z",
  "warnings": [
    {
      "areaCode": "PT · Costa Oeste",
      "areaLabel": "PT · Costa Oeste",
      "type": "Agitação Marítima",
      "level": "orange",
      "text": "Ondas de sudoeste ...",
      "startTime": "2026-08-14T09:00:00.000Z",
      "endTime": "2026-08-15T21:00:00.000Z",
      "relevant": true
    }
  ],
  "spotWarnings": { "moledo": [ { "...": "..." } ] }
}
```

### GitHub Actions (produção)

1. Repo → **Actions** → workflow **Update VenTu Data** → **Run workflow**
2. `force_mode`: `full` → **Run workflow**
3. Para exercitar o fallback num run real, basta que o IPMA esteja em baixo — o log do
   passo mostra `IPMA down — falling back to MeteoAlarm (EUMETNET)...` e o commit gerado
   tem `"source": "meteoalarm"` no `public/data/warnings.json`.
4. Para validar o secret sem depender de uma falha do IPMA, corre
   `METEOALARM_API_KEY=xxxxxxxx npm run warnings:test-key` num runner local.

---

## Diagnóstico

| Sintoma | Causa provável | Acção |
|---|---|---|
| `METEOALARM_API_KEY not set — skipping MeteoAlarm fallback` | Secret ausente / variável não exportada | Passo 3; `echo ${#METEOALARM_API_KEY}` local para confirmar |
| `HTTP 401` / `403 — token inválido` | Token com espaço/linha extra, expirado ou revogado | Revalidar (Passo 2, curl) e recriar o secret |
| `MeteoAlarm OK but no active warnings` | Sem avisos activos em PT naquele momento (ou todos expirados) | Comportamento correcto — payload vazio mas válido |
| `spotWarnings` vazio com warnings activos | Bbox do aviso não cobre o spot (mapping mais largo que o distrito do IPMA) | Esperado para avisos costeiros estreitos; o IPMA volta a ser primário |
| `source` ausente no warnings.json | Ficheiro antigo (pré-`source`) mantido pelo fallback | Correr `npm run warnings:fetch` (ou `warnings:meteoalarm`) |
| CAP `HTTP 4xx/5xx` por aviso | URL assinado expirado ou storage em baixo | O aviso entra com `cap: null` (ignorado) sem bloquear o resto |

---

## Degradação graciosa (sem token / MeteoAlarm em baixo)

- Sem `METEOALARM_API_KEY`, `fetch-ipma-warnings.js` usa apenas o IPMA e avisa no log;
  o fallback é simplesmente saltado.
- Se o fallback falhar (token inválido, rede, API em baixo), mantém-se o `warnings.json`
  anterior (ou continua-se sem avisos) — a pipeline (Open-Meteo, boias, observações)
  nunca fica bloqueada.
- `validate-generated-data.js` valida `source` como `'ipma' | 'meteoalarm'` e trata
  `warnings.json` como warn-only (nunca bloqueia o deploy).
