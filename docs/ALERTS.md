# VenTu — Alertas por email (E1)

Alertas quando o score de um spot atinge o limiar definido (máx. 1 email por 3 horas por subscrição).

## Arquitectura

```
Spot detail → AlertSubscribeForm → Supabase alert_subscriptions
                                              ↓
GitHub Actions (evaluate-alerts.yml, */3h) → scripts/evaluate-alerts.js → Resend
                                              ↓
Utilizador ← email confirmação / alerta ← /pt/alerts/confirm|unsubscribe/?token=…
```

## Pré-requisitos (uma vez)

### 1. Supabase

1. Abre o [SQL Editor](https://supabase.com/dashboard) do projecto VenTu.
2. Executa o ficheiro [`supabase/supabase-alerts.sql`](../supabase/supabase-alerts.sql) na íntegra.
3. Confirma que a tabela `alert_subscriptions` existe e que as funções `verify_alert_subscription` e `unsubscribe_alert` estão expostas a `anon`.

### 2. Resend

1. Conta em [resend.com](https://resend.com).
2. Verifica o domínio `ventu.surf` (ou usa domínio de teste em staging).
3. Cria API key com permissão de envio.

### 3. GitHub Secrets (produção)

Em **Settings → Secrets and variables → Actions**:

| Secret | Obrigatório | Descrição |
|--------|-------------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | URL do projecto (já usado no deploy) |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Service role — **nunca** no frontend |
| `RESEND_API_KEY` | Sim | API key Resend |
| `RESEND_FROM` | Recomendado | Ex.: `VenTu <alerts@ventu.surf>` |

O workflow [`.github/workflows/evaluate-alerts.yml`](../.github/workflows/evaluate-alerts.yml) corre:

- **Cron:** `15 */3 * * *` (15 min após cada update de condições)
- **Manual:** Actions → *Evaluate Alerts* → *Run workflow*

## Verificação local

```bash
# Carrega .env.local se existir (SUPABASE_*, RESEND_*)
npm run alerts:preflight

# Dry-run / envio real (precisa de service role + Resend)
npm run alerts:evaluate
```

`alerts:preflight` valida ficheiros, variáveis e ligação à tabela. Sem `RESEND_API_KEY` o evaluate faz dry-run (só log).

## Teste end-to-end (produção)

1. Em https://ventu.surf/pt/spots/guincho/ — subscrever alerta com email real.
2. Actions → **Evaluate Alerts** → Run workflow (ou esperar o cron).
3. Receber email **Confirma o teu alerta** → clicar link → `/pt/alerts/confirm/?token=…`
4. Quando score ≥ limiar → email de condições boas.
5. Link **Cancelar alerta** → `/pt/alerts/unsubscribe/?token=…`

## Fluxo do utilizador (UI)

- Formulário no detalhe do spot (`AlertSubscribeForm.tsx`).
- Sem Supabase configurado: mensagem «Alertas indisponíveis».
- Subscrição fica `verified: false` até confirmar por email.
- Cooldown 3h entre alertas de condições; reenvio de confirmação no máximo 1×/24h se ainda não verificado.

## Troubleshooting

| Sintoma | Causa provável |
|---------|----------------|
| Formulário diz Supabase não configurado | Faltam `NEXT_PUBLIC_SUPABASE_*` no build |
| Sem email de confirmação | `RESEND_API_KEY` em falta no workflow ou domínio não verificado |
| Confirm link 404 / falha | SQL não aplicado ou token inválido |
| Alertas nunca chegam | Subscrição não confirmada, score abaixo do limiar, ou cooldown 3h |
