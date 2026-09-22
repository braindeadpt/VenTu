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

**Segurança (S2):** o `subscribe_alert` foi endurecido — token gerado no servidor (`gen_random_uuid`), rate limit por IP (`request.headers`/`x-forwarded-for`) + por `client_id`, UNIQUE `(email, spot_slug, sport)` enquanto activo, e máximo de 5 subscrições activas não verificadas por email (mata o vector de spam de emails de verificação). Os grants anon directos à tabela foram revogados — a RPC é a única via de escrita anónima. Aplicar `supabase/supabase-alerts-harden-legacy.sql` no SQL Editor.

**Defesa em profundidade no evaluator (H2):** mesmo com o tecto de 5 linhas pendentes, o `evaluate-alerts.js` decide os emails de confirmação **por endereço** e nunca por linha — todas as linhas do mesmo endereço partilham o cooldown de 24h (usando o envio mais recente entre elas) e passa no máximo 1 email de confirmação por endereço por janela, com tecto de 100 endereços por corrida (`selectVerificationTargets`). Assim, linhas pendentes antigas ou pré-endurecimento não voltam a virar um relay.

## Pré-requisitos (uma vez)

### 1. Supabase

1. [SQL Editor](https://supabase.com/dashboard) do projecto VenTu.
2. Executa [`supabase/supabase-rate-limit-common.sql`](../supabase/supabase-rate-limit-common.sql) (helpers de rate limit partilhados — **obrigatório antes do passo 5**).
3. Executa [`supabase/supabase-alerts.sql`](../supabase/supabase-alerts.sql) (E1).
4. Executa [`supabase/supabase-auth-profiles.sql`](../supabase/supabase-auth-profiles.sql) (F1).
5. Executa [`supabase/supabase-alerts-harden-legacy.sql`](../supabase/supabase-alerts-harden-legacy.sql) (S2 — `subscribe_alert` endurecido; **sem este passo não existe caminho de escrita anónima**).
6. Executa [`supabase/supabase-alerts-e1c.sql`](../supabase/supabase-alerts-e1c.sql) (E1c).
7. Executa [`supabase/supabase-alerts-e1b-frequency.sql`](../supabase/supabase-alerts-e1b-frequency.sql) (E1b — digest vs imediato).
8. Confirma tabelas `alert_subscriptions` e `user_alert_prefs`.
9. Se já tinhas E1c aplicado: re-executa as funções `verify_user_alerts` / `verify_alert_token` de `supabase-alerts-e1c.sql` (confirmação idempotente).

> [`supabase/supabase-alerts-subscribe-rpc.sql`](../supabase/supabase-alerts-subscribe-rpc.sql) está **obsoleto**: já não cria `subscribe_alert`, apenas remove a assinatura antiga (era um relay de email com rate limit rotável pelo cliente). Não faças `CREATE` dele por engano — o RPC válido vive em `supabase-alerts-harden-legacy.sql`.

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

## Telegram (MVP)

Mesmo digest/imediato dos favoritos (E1c), enviado também via Bot API se a conta estiver ligada.

### Setup (uma vez)

1. Cria bot com [@BotFather](https://t.me/BotFather) → guarda o token.
2. Executa [`supabase/supabase-telegram.sql`](../supabase/supabase-telegram.sql) no SQL Editor.
3. GitHub (o site é **GitHub Pages**, não Vercel):
   - **Secret** `TELEGRAM_BOT_TOKEN` — token do BotFather (Settings → Secrets → Actions)
   - **Variable** `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` — username sem `@`  
     (Settings → Secrets and variables → **Actions** → separador **Variables** → New repository variable)  
     Ex.: `VenTuAlertsBot`
4. Commit/push do código Telegram + novo deploy (Actions → Deploy to GitHub Pages).
5. Workflows: `evaluate-alerts` (envia avisos) + `telegram-poll` (liga `/start` a cada ~5 min).
   Sem o secret, o poll **falha** de propósito — o bot não responde sozinho.

### Fluxo utilizador

1. Activar alertas por email em `/favorites` e confirmar.
2. Em `/conta` → **Ligar Telegram** → abrir bot → **Start**.
3. Em até ~5 min o poll confirma; mensagem «Ligado ✅» (ou corre `npm run telegram:poll` com o token no `.env.local` para resposta imediata).
4. Quando favoritos ≥ limiar → email + Telegram.

Sem `TELEGRAM_BOT_TOKEN` o evaluate ignora Telegram (dry-run no log).

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
