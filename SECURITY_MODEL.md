# Threat model — braindeadpt (10 repositórios)

Estado: v2 (16/11/2026), com respostas do dono. Factos marcados **[utilizador]** vêm do dono (respostas, SECURITY.md); o resto é leitura do código e não muda prioridades.

## 1. Visão geral e fronteiras de confiança

Três famílias independentes, alojadas em Oracle Cloud A1 (ap-tokyo-1) segundo `braindeadpt/infra`:

| Host | Papel | Portas públicas |
|---|---|---|
| `apps-01` | oficinaos-cloud, oficinaos-market, demo | 80/443 via Caddy/Cloudflare Tunnel |
| `bots-01` | Trading-bot-hyperliquid_V1, Meridian-Bot | nenhuma (admin só via Tailscale, `infra/tailnet/acl.hujson`) |

Sites estáticos/serverless correm fora destes hosts (GitHub Pages, Cloudflare Workers/Pages, Vercel, Supabase).

Fronteiras: internet → Cloudflare/Caddy → apps-01; LAN da loja → app OficinaOS (HTTP sem TLS, por desenho — `server/plugins/security.ts`); app da loja → Cloud (poller ~2 min com token de loja); terceiros (Meta Graph/WhatsApp, Solana RPC/Meteora, Hyperliquid, LLMs) → bots e serviços.

## 2. Componentes

| Component | Repositório(s) / código | Notas |
|---|---|---|
| **Bots** | `Meridian-Bot` (todo), `Trading-bot-hyperliquid_V1` (todo) | Chaves: `Meridian-Bot/wallet-signer.js` (env `WALLET_PRIVATE_KEY` ou `user-config.json`), `Trading-bot…/src/security/vault.py`. LLM ReAct loop + Discord/Telegram no Meridian. Trading-bot paper-only (mainnet bloqueado). |
| **Shop App** | `OficinaOS` (`server/`, `src/`, `prisma/`, `installer/`) | Self-hosted na LAN da loja; dados de clientes, códigos de desbloqueio, assinaturas, POS, AI Analyst (tools só leitura), Evolution API local. |
| **Cloud** | `oficinaos-cloud` | Contas, pairing, entitlements Pro, relay WhatsApp (token Meta AES-GCM com `SECRETS_KEY`), portal público `/t/:token`, assinatura remota `/sign/:token`, webhook Meta HMAC. |
| **Market** | `oficinaos-market` (`src/`, `web/`, `deploy/`) | Marketplace B2B público e multi-tenant: contas (email+NIF), propostas/contratos, RMA, MCP server `src/routes/mcp.ts`, CSRF por `Origin`. |
| **Diag** | `oficinaos-diag` | App Windows (.NET) com ADB/USB; serve página de teste na rede local; envio opcional de relatórios à Cloud. |
| **Public Sites** | `VenTu`, `aocentimo`, `oficinaos-website`, `pergunta-ao-ze` | Sem contas. VenTu: worker Cloudflare, Supabase (RLS, alertas por email), pipelines GitHub Actions com push automático, Terraform de headers. pergunta-ao-ze: `app/api/responder` chama LLM. website: formulário beta. |
| **Infra** | `braindeadpt/infra` (contexto), `*/deploy/`, `docker-compose*.yml`, `VenTu/terraform/` | Hardening, Tailscale, Caddy, backups restic. |

## 3. Entradas e quem lhes chega

- Internet anónima: Cloud (`/t/:token`, `/sign/:token`, `/webhooks/whatsapp`, `/pairing/redeem`), Market (registo, teaser público, API, MCP), sites públicos, `pergunta-ao-ze /api/responder`, worker VenTu e RPCs Supabase.
- Utilizadores autenticados: lojas na Cloud (token de loja), sellers no Market, staff na Shop App (RBAC Owner/Technician/Front Desk).
- LAN da loja: Shop App inteira, `/setup` (loopback ou `SETUP_TOKEN`), página de teste do Diag.
- Conteúdo lido por LLMs: canais Discord/Telegram (Meridian), dados da BD (AI Analyst), perguntas do público (Zé).
- Operador: bots-01/apps-01 via Tailscale.

## 4. Ativos e sensibilidade

**[utilizador]** Todos os ativos abaixo (1–4) são críticos por igual: chaves dos bots, dados de clientes das lojas, tokens Meta/WhatsApp e entitlements Pro, contas/negociações/pagamentos do Market.


1. Chaves de carteira Solana e API Hyperliquid (perda financeira direta).
2. Dados pessoais de clientes das lojas (telefones, códigos/padrões de desbloqueio, assinaturas, dados de trade-in) — RGPD.
3. Tokens Meta/WhatsApp das lojas e `SECRETS_KEY` na Cloud; entitlements Pro (receita).
4. Contas, negociações e reputação no Market; isolamento entre sellers.
5. Integridade dos sites públicos (XSS, supply chain de pipelines com push), lista de emails de alertas VenTu, chaves LLM (custo).

## 5. Atacantes considerados

**[utilizador]** Todos os perfis A1–A5 importam (internet, tenant autenticado malicioso, LAN da loja, prompt injection via conteúdo lido por LLMs). Mas a LAN é de confiança (ver §7): A3 só vale como prioridade baixa.


- A1 Internet anónima (principal para Cloud, Market, sites).
- A2 Tenant malicioso autenticado (outra loja na Cloud, outro seller no Market) — IDOR/isolamento.
- A3 Alguém na LAN/Wi-Fi da loja (Shop App, Diag).
- A4 Prompt injection via conteúdo lido por LLMs (Meridian, AI Analyst, Zé).
- A5 Supply chain / CI (GitHub Actions com push automático, deps).

## 6. Controlos existentes

Cloud/Market atrás de Cloudflare Tunnel + Caddy, zero portas publicadas, contentores `read_only`; webhook Meta com HMAC; tokens Meta cifrados AES-GCM e nunca devolvidos à app; documentos públicos redigidos (`publicDocumentView`); assinatura single-use com rate-limit; CSRF por `Origin` no Market; bots-01 sem portas públicas; vault Fernet/PBKDF2 no Trading-bot; Terraform de CSP/headers no VenTu; RLS no Supabase.

## 7. Fora de âmbito / risco aceite

- **[utilizador — SECURITY.md OficinaOS e VenTu]** Vulnerabilidades de dependências de terceiros (reportadas upstream), engenharia social, DoS volumétrico, ataques a infraestrutura de terceiros (GitHub, Cloudflare, Supabase, Open-Meteo…).
- **[utilizador — SECURITY.md OficinaOS]** Problemas que exigem acesso físico ao servidor self-hosted; instâncias self-hosted mal configuradas pelo operador (passwords fracas, BD exposta, falta de TLS); sugestões sem vulnerabilidade concreta.
- **[utilizador — resposta 16/11]** A LAN da loja é de confiança: risco aceite, e ataques que exigem estar na LAN/Wi-Fi da loja (Shop App, página de teste do Diag) são baixa prioridade.
- **[utilizador — SECURITY.md OficinaOS]** Relaxamento HTTP para LAN de confiança (sem HSTS, cookies não-`Secure`) é intencional (`CLAUDE.md`).

## 8. Questões em aberto

- **[utilizador]** Um dashboard/HTTP dos bots **está exposto à internet** (contradiz `infra` README: bots-01 sem portas públicas). Qual e onde? Até lá, superfícies HTTP dos Bots contam como alcançáveis por A1.

## 9. Etiquetas dos findings

`Component` (§2), `CVE`, `RGPD` (sim quando o finding envolve dados pessoais), `Repository` (repositório/produto). **[utilizador]**
