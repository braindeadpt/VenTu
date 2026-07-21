# VenTu — Alertas por email (E1 + E1c)

Dois modos (E1b): **resumo diário** (~7h30, por defeito) ou **imediato** (máx. 1 email / 3h).

## E1c (actual) — favoritos + conta

```
/favorites → FavoritesAlertsPanel → subscribe_favorites_alerts RPC
                                              ↓
                         user_alert_prefs + user_favorites
                                              ↓
GitHub Actions (evaluate-alerts.yml) → digest ou imediato (Resend)
                                              ↓
Utilizador ← confirmação / alerta ← /pt/alerts/confirm|unsubscribe/?token=…
```

- **Um** email de confirmação para todos os favoritos
- **Digest (default):** 1 email por dia ~7h30 (Lisboa) se algum favorito ≥ limiar
- **Imediato (opcional):** quando condições batem, máx. 1× / 3h
- Gerir em `/favorites#alertas` ou `/conta`

## E1 (legacy) — por spot, anónimo

Subscrições antigas em `alert_subscriptions` continuam a funcionar. O evaluator trata ambos os modos.

## Pré-requisitos (uma vez)

### 1. Supabase

1. [SQL Editor](https://supabase.com/dashboard) do projecto VenTu.
2. Executa [`supabase/supabase-alerts.sql`](../supabase/supabase-alerts.sql) (E1).
3. Executa [`supabase/supabase-auth-profiles.sql`](../supabase/supabase-auth-profiles.sql) (F1).
4. Executa [`supabase/supabase-alerts-e1c.sql`](../supabase/supabase-alerts-e1c.sql) (E1c).
5. Executa [`supabase/supabase-alerts-e1b-frequency.sql`](../supabase/supabase-alerts-e1b-frequency.sql) (E1b — digest vs imediato).
6. Confirma tabelas `alert_subscriptions` e `user_alert_prefs`.
7. Se já tinhas E1c aplicado: re-executa as funções `verify_user_alerts` / `verify_alert_token` de `supabase-alerts-e1c.sql` (confirmação idempotente).

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

- **Cron imediato:** `15 */3 * * *` (15 min após cada update de condições)
- **Cron digest:** `30 7 * * *` (timezone `Europe/Lisbon`)
- **Manual:** Actions → *Evaluate Alerts* → *Run workflow*

## Verificação local

```bash
# Carrega .env.local se existir (SUPABASE_*, RESEND_*)
npm run alerts:preflight

# Dry-run / envio real (precisa de service role + Resend)
npm run alerts:evaluate
```

`alerts:preflight` valida ficheiros, variáveis e ligação à tabela. Sem `RESEND_API_KEY` o evaluate faz dry-run (só log).

## Teste end-to-end (produção, E1c)

1. Entra em https://ventu.surf com magic link.
2. Guarda 1+ spots nos favoritos.
3. Em `/pt/favorites/` — **Activar alertas** (score + modalidade).
4. Actions → **Evaluate Alerts** → Run workflow (ou esperar cron).
5. Email **Confirma alertas nos teus favoritos** → link → `/pt/alerts/confirm/?token=…`
6. Quando score ≥ limiar → digest com spots a bombar.
7. **Desactivar** em favoritos ou link cancelar no email.

## Fluxo do utilizador (UI)

- Painel em `/favorites` (`FavoritesAlertsPanel.tsx`).
- Estado na `/conta` com link **Gerir alertas**.
- Sem favoritos: não é possível activar.
- Subscrição fica `verified: false` até confirmar por email.

## Troubleshooting

| Sintoma | Causa provável |
|---------|----------------|
| Formulário diz Supabase não configurado | Faltam `NEXT_PUBLIC_SUPABASE_*` no build |
| Sem email de confirmação | `RESEND_API_KEY` em falta no workflow ou domínio não verificado; confirmação só é enviada no cron `evaluate-alerts` (até ~3h), não no submit |
| Confirm link 404 / falha | SQL não aplicado ou token inválido |
| Alertas nunca chegam | Subscrição não confirmada, score abaixo do limiar, digest antes das 7h Lisboa / já enviado hoje, ou cooldown 3h (imediato) |
