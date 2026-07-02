# VenTu — Contas e favoritos (F1)

Login com **magic link** (sem password). Favoritos exigem sessão e sincronizam via Supabase.

## Setup Supabase (uma vez)

### 1. SQL

Executa [`supabase/supabase-auth-profiles.sql`](../supabase/supabase-auth-profiles.sql) no SQL Editor.

### 2. Auth — redirect URLs

Dashboard → **Authentication** → **URL Configuration**:

| Campo | Valor |
|-------|--------|
| Site URL | `https://ventu.surf` |
| Redirect URLs | `https://ventu.surf/pt/auth/callback/` |
| | `https://ventu.surf/en/auth/callback/` |
| | `http://localhost:3000/pt/auth/callback/` (dev) |

### 3. Email de login (recomendado: Resend)

Dashboard → **Authentication** → **SMTP Settings**:

- Host: `smtp.resend.com`
- Port: `465` (SSL)
- User: `resend`
- Password: API key Resend
- Sender: `VenTu <alerts@ventu.surf>` (ou `noreply@ventu.surf`)

Alternativa: email built-in Supabase (limite no free tier).

## Fluxo utilizador

1. **Entrar** no header → email → magic link
2. Clica link → `/pt/auth/callback/` → sessão activa
3. **Favoritos** — coração nos spots (só logado)
4. `/favorites` — lista sync entre dispositivos
5. `/conta` — email, sair, link favoritos

## Migração localStorage

Na primeira sessão, favoritos antigos (`windspot-favorites`) importam para `user_favorites` e o local é limpo.

## Tabelas

| Tabela | Função |
|--------|--------|
| `profiles` | locale, plan (`free`) |
| `user_favorites` | `user_id` + `spot_id` |

## Próximo: E1c

Alertas multi-spot ligados a `user_id` (depois do F1 em produção).
