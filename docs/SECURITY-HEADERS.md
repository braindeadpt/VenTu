# Segurança HTTP — headers reais (S7)

Decisão de arquitectura para servir CSP, `X-Frame-Options` e `frame-ancestors` como **headers HTTP reais**, impossíveis de obter no GitHub Pages (que não permite headers custom e ignora `public/_headers`).

> **Estado:** decisão tomada (2026-08-13). Implementação pendente de acção manual no dashboard Cloudflare (DNS + regras) — ver [Passos](#passos-de-implementação).

---

## 1. Contexto verificado (2026-08-13)

- **DNS actual:** `ventu.surf` e `www.ventu.surf` apontam directamente para os IPs do GitHub Pages (`185.199.108-111.153`) — **sem proxy**.
- **Headers servidos hoje:** nenhum header de segurança. O GitHub Pages envia até `Access-Control-Allow-Origin: *` em todas as respostas.
- **Mitigação actual:** CSP via `<meta http-equiv>` em `src/components/CSPMeta.tsx`. Funciona para `script-src`/`img-src`/etc., mas **`frame-ancestors` é ignorado pelos browsers em meta tags** (só vale em header HTTP) — a protecção anti-clickjacking está efectivamente ausente hoje.
- **Design canónico já existe no repo:** `public/_headers` (funciona em Netlify/Cloudflare Pages; ignorado no GitHub Pages) define o conjunto completo de headers, incluindo o **footgun do `/embed/*`** — o widget B2B de escolas (`/embed/spot/{slug}/`) tem de permanecer iframeable (`frame-ancestors *`, sem `X-Frame-Options`).

## 2. Decisão

**Colocar Cloudflare à frente do `ventu.surf` (DNS proxied, "orange cloud") e servir os headers via Response Header Transform Rules**, espelhando o `public/_headers`.

- Mantém o **GitHub Pages como origin** — sem migração de deploy, sem mudar o `deploy.yml`.
- Sem código para manter (regras na UI/API, versionáveis por Terraform se desejado).
- Gratuito — *HTTP Response Header Modification* está disponível em **todos os planos** Cloudflare (confirmado na doc oficial).
- O CSP do header deve **espelhar exactamente** o `CSP_META` actual (a meta permanece como fallback: quando header + meta existem, os browsers aplicam a intersecção das duas políticas — sendo idênticas, não há conflito).

### 2.1 Porquê Transform Rules e não um Worker de proxy

| Opção | Prós | Contras | Veredicto |
|---|---|---|---|
| **A. DNS proxied + Transform Rules** | Sem código, sem worker no request path, sem limites de execução, gratuito, remove headers (`ACAO:*`) | Regras na UI (versionar exige Terraform/API) | ✅ **Escolhida** |
| B. Cloudflare Worker proxy em `ventu.surf/*` | Versionável no repo, controlo total | Limite free ~100k req/dia, hop extra, tem de cachear com Cache API (senão perde o cache edge), mais superfície | ❌ Sem ganho vs A para headers estáticos |
| C. Migrar para Cloudflare Pages | `public/_headers` funciona nativamente (zero regras) | Muda o pipeline de deploy (deploy.yml → CF Pages), move DNS, perde o GitHub Pages | 🔁 Alternativa válida se um dia se migrar o hosting |

Nota: um Worker que faça `fetch` ao **próprio domínio** não entra em loop (o subrequest vai directo ao origin), mas para headers estáticos o custo/latência/limites não compensam.

## 3. Passos de implementação

> ⚠️ **Acesso manual necessário** — dashboard Cloudflare da zona `ventu.surf` (fora do repo).

### 3.1 DNS (proxy)

1. Adicionar `ventu.surf` à Cloudflare (plano free chega) e apontar o DNS para a Cloudflare.
2. Registo DNS existente (A/AAAA para GitHub Pages) → ligar o **proxy** (nuvem laranja).
   - O CNAME `ventu.surf` → `braindeadpt.github.io` no repo GitHub Pages mantém-se (necessário para o certificado do GitHub).
   - `www.ventu.surf` → CNAME para `ventu.surf`, também proxied.
3. **SSL/TLS:** modo *Full (strict)*. Manter *Always Use HTTPS* ligado.
4. **HSTS:** ativar em *SSL/TLS → Edge Certificates → HSTS* (max-age 31536000, includeSubDomains) — ou via regra abaixo; nunca ambos com valores diferentes.

### 3.2 Transform Rules (Rules → Transform Rules → Modify Response Header)

Espelhar `public/_headers`. **Ordem importa** (regras correm por ordem; a última com match sobrescreve).

**Regra 1 — `/embed/*` (mantém o widget iframeable):**

- **Filter:** `starts_with(http.request.uri.path, "/embed/")`
- **Actions (Set static):**
  - `Content-Security-Policy` → `default-src 'self'; script-src 'self' 'unsafe-inline' https://gc.zgo.at; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com https://*.supabase.co; connect-src 'self' https://gc.zgo.at https://*.goatcounter.com https://*.supabase.co wss://*.supabase.co https://api.open-meteo.com https://marine-api.open-meteo.com https://*.workers.dev; frame-src 'self' https://www.openstreetmap.org https://www.youtube-nocookie.com https://www.youtube.com https://www.weatherlink.com https://embed.cdn-surfline.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors *; upgrade-insecure-requests`
  - `X-Content-Type-Options` → `nosniff`
  - `Referrer-Policy` → `strict-origin-when-cross-origin`
- **Actions (Remove):** `X-Frame-Options` (não enviar em `/embed/*`)
- ⚠️ **Não alterar** `frame-ancestors` para `'none'` em `/embed/*` — quebra o widget B2B silenciosamente (footgun documentado em `public/_headers`).

**Regra 2 — resto do site (catch-all):**

- **Filter:** `not starts_with(http.request.uri.path, "/embed/")`
- **Actions (Set static):**
  - `Content-Security-Policy` → igual à Regra 1 mas com `frame-ancestors 'none'` (única diferença)
  - `X-Frame-Options` → `DENY`
  - `X-Content-Type-Options` → `nosniff`
  - `X-XSS-Protection` → `1; mode=block` (legacy, inócuo)
  - `Referrer-Policy` → `strict-origin-when-cross-origin`
  - `Permissions-Policy` → `camera=(), microphone=(), geolocation=(self), payment=(), usb=()`
  - `Strict-Transport-Security` → `max-age=31536000; includeSubDomains; preload` (apenas se não ativado em Edge Certificates)
- **Actions (Remove):** `Access-Control-Allow-Origin` (o GitHub Pages envia `*`; sem necessidade de CORS aberto — o worker `/obs` já tem CORS controlado no seu próprio domínio)

### 3.3 Cache (opcional, fora do escopo deste hardening)

As regras de `Cache-Control` do `public/_headers` (`/_next/static/*` immutable, `/data/*` SWR) **não afectam o cache edge da Cloudflare** (a doc oficial: modificação de `cache-control` via transform rules não muda o comportamento de cache da CF). Para cache edge real, usar **Cache Rules** ou **Cloudflare Pages**. Hoje o GitHub Pages já serve `Cache-Control: max-age=600` e o service worker do site faz cache-first com TTL — suficiente.

## 4. Validação

Depois de aplicar, confirmar em produção:

```bash
# Header CSP real (já não é só meta):
curl -sI https://ventu.surf/pt/ | grep -iE "content-security|x-frame|strict-transport|access-control"

# frame-ancestors 'none' fora do embed:
curl -sI https://ventu.surf/pt/ | grep -io "frame-ancestors[^;]*"

# /embed/* continua iframeable (frame-ancestors *, sem X-Frame-Options):
curl -sI https://ventu.surf/embed/spot/moledo/ | grep -iE "x-frame|frame-ancestors"

# ACAO:* removido:
curl -sI https://ventu.surf/pt/ | grep -i "access-control" || echo "ACAO removido ✓"
```

## 5. Notas

- **CSP meta permanece** (`CSPMeta.tsx`) como fallback para origins secundários (preview em `github.io`, abrir o `out/` localmente). Não remover: header + meta idênticos = intersecção sem conflito.
- **Fonte de verdade do design:** `public/_headers`. Se um dia houver migração para Netlify/Cloudflare Pages (Opção C), o ficheiro passa a valer nativamente e as Transform Rules podem ser removidas.
- Achado associado (corrigido por esta decisão): o `Access-Control-Allow-Origin: *` do GitHub Pages desaparece do response.
