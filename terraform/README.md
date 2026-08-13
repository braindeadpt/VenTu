# Terraform — S7 HTTP security headers + Cache Rules (Cloudflare Ruleset)

Versão **versionável** (infra-as-code) das 2 Transform Rules do
[`docs/SECURITY-HEADERS.md`](../docs/SECURITY-HEADERS.md) §3.2 **e** das 3
Cache Rules C1/C2/C3 do §3.3 — alternativa ao painel do Cloudflare para o
mesmo resultado.

| Ficheiro | O que é |
|---|---|
| `main.tf` | 2 `cloudflare_ruleset`: `ventu_security_headers` (fase `http_response_headers_transform`, 2 regras: catch-all + `/embed/*`) e `ventu_cache_rules` (fase `http_request_cache_settings`, 3 regras: C1 `/_next/static/*` 1y, C2 `/data/*` 5min, C3 `/sw.js` bypass) |
| `variables.tf` | Inputs: token, zona, e os dois CSPs (defaults = SECURITY-HEADERS.md; ⚠️ manter em sincronia com `CSPMeta.tsx`) |
| `terraform.tfvars.example` | Template de configuração local (gitignored) |

## Aplicação passo a passo (runbook)

> O plano assume as fases **vazias** (0 regras) — o pré-flight da Fase 1 confirma.
> Cada fase é independente e reversível até à Fase 5 (apply).

### Fase 0 — Pré-requisitos (fazer PRIMEIRO)

1. **DNS já proxied na Cloudflare** — `ventu.surf` adicionado à Cloudflare com
   o proxy ligado (nuvem laranja) e SSL/TLS em *Full (strict)*. Sem isto, o
   ruleset não tem efeito (o tráfego nem passa pela Cloudflare) e o pré-flight
   da Fase 1 devolve `zone not found`. Passos detalhados:
   `docs/SECURITY-HEADERS.md` §3.1.
2. **API token Cloudflare** com permissões `Zone > Transform Rules: Edit` e
   `Zone > Zone: Read` na zona `ventu.surf`.
3. **Terraform CLI ≥ 1.5** (`terraform version`) — o CI valida o HCL, mas o
   `apply` corre a partir da tua máquina.

### Fase 1 — Pré-flight read-only (nada é alterado)

Confirma que (a) a zona está na Cloudflare e (b) as duas fases estão **vazias**
— se já tiverem regras (criadas no painel), o apply de um ruleset novo entra
em conflito (ver "Se o apply falhar"):

```bash
export CLOUDFLARE_API_TOKEN=<token>
ZONE_ID=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=ventu.surf" \
  | jq -r '.result[0].id')
echo "zone_id=$ZONE_ID"   # vazio → a zona NÃO está na Cloudflare (voltar à Fase 0)

# Regras em uso na fase de headers (esperado: 0)
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/rulesets/phases/http_response_headers_transform/entrypoint" \
  | jq '.result.rules | length'

# Regras em uso na fase de cache (esperado: 0)
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/rulesets/phases/http_request_cache_settings/entrypoint" \
  | jq '.result.rules | length'
```

### Fase 2 — Config local (nunca commitar terraform.tfvars)

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # gitignored (linha 87 do .gitignore)
# preencher cloudflare_api_token e zone_name ("ventu.surf")
# — ou: export CLOUDFLARE_API_TOKEN=... e remover a linha do tfvars
```

### Fase 3 — Inicializar

```bash
terraform init   # descarrega o provider cloudflare/cloudflare (pinned no lock file)
```

### Fase 4 — Rever o plano

```bash
terraform plan
```

Esperado: **2 a criar** (`cloudflare_ruleset.ventu_security_headers` +
`cloudflare_ruleset.ventu_cache_rules`), **0 a alterar**, **0 a destruir**.
O `data.cloudflare_zone` resolve a zona nesta fase — se falhar com
`zone not found`, voltar à Fase 0 (DNS ainda nos nameservers da Namecheap).
Sem token real, o plan **falha no provider** antes de gerar plano
(`invalid value for api_token` com placeholder, ou `Invalid access token 9109`
com token inválido) — nesse caso voltar às **Fases 1–2** (ver "Se o apply
falhar"). As expressões WAF (ex.: `starts_with(http.request.uri.path, "/embed/")`)
são validadas aqui — um erro de expressão falha o plan, não o apply.

### Fase 5 — Aplicar

```bash
terraform apply          # rever + confirmar (yes)
# ou, depois de rever o plan na Fase 4: terraform apply -auto-approve
```

Aplica os 2 rulesets (headers + cache). A propagação é rápida (segundos), mas
o cache edge só mostra HIT depois de um warm-up (1.º GET).

### Fase 6 — Validação pós-apply (scripts/check-security-headers.sh)

Da raiz do repo:

```bash
bash scripts/check-security-headers.sh     # exit 0 = tudo ok
# ou: npm run check:headers
```

O checker valida as 2 frentes — headers S7 e cache edge:

| Check | Esperado |
|---|---|
| `/pt/` Content-Security-Policy | `frame-ancestors 'none'` presente |
| `/pt/` X-Frame-Options | `DENY` |
| `/pt/` X-Content-Type-Options / HSTS / Referrer-Policy | presentes |
| `/pt/` Access-Control-Allow-Origin | **ausente** (Regra 2 remove) |
| `/embed/spot/moledo/` CSP | `frame-ancestors *` |
| `/embed/spot/moledo/` X-Frame-Options | **ausente** (widget B2B iframeable) |
| C1 `/_next/static/*` (asset real extraído do HTML) | `cf-cache-status: HIT` |
| C2 `/data/news.json` | `cf-cache-status: HIT` |
| C3 `/sw.js` | `cf-cache-status: DYNAMIC` (bypass) |

Qualquer FAIL = rever `docs/SECURITY-HEADERS.md` (proxy não aplicado? regra
errada?). Equivalências curl manuais: `docs/SECURITY-HEADERS.md` §4.

### Fase 7 — Ativar o guard no CI (depois de exit 0)

O job `security-headers` do `deploy.yml` (docs/SECURITY-HEADERS.md §4.1) corre o
mesmo verificador após cada deploy e falha o run se algo regredir — está
**desativado por omissão** (falha de propósito contra o GitHub Pages puro):

1. Settings → Secrets and variables → Actions → Variables
2. Criar `S7_PROXY_ENABLED = true`
3. O próximo deploy passa a validar headers + cache automaticamente; se
   regredir, o run fica vermelho.

## Rollback

```bash
terraform destroy        # remove os 2 rulesets (headers + cache deixam de ser servidos)
# Alternativa rápida no painel: Rules → Transform Rules / Cache Rules → desligar
```

## Se o apply falhar

| Sintoma | Causa provável | Solução |
|---|---|---|
| `invalid value for api_token (API tokens must only contain characters…)` — falha no `provider "cloudflare"` (main.tf:29), **antes** de chegar à API | Token não preenchido / formato inválido — ex.: o placeholder `CHANGE_ME…` tem <40 chars e o provider rejeita-o na validação (verificado no dry-run) | **Fase 2** — preencher `cloudflare_api_token` real no `terraform.tfvars` (ou `export CLOUDFLARE_API_TOKEN=…` e remover a linha do tfvars) |
| `error listing zones: Invalid access token (9109)` no `data.cloudflare_zone` (main.tf:32) | Token com formato válido mas **não autentica** (expirado/revogado/errado) | **Fase 1** — correr o pré-flight read-only com esse token; se `9109` persistir, criar um novo com `Zone > Transform Rules: Edit` + `Zone: Read` na zona `ventu.surf` |
| `403`/`authentication error` na API | Token sem permissão `Transform Rules: Edit` na zona certa | **Fases 1/2** — validar no pré-flight; criar o token com a permissão na zona `ventu.surf` |
| `zone not found` no plan | DNS ainda nos nameservers da Namecheap | Fase 0 — adicionar a zona e proxied (SECURITY-HEADERS.md §3.1) |
| `409 conflict` / fase já tem ruleset | Regras criadas no painel | `terraform import cloudflare_ruleset.ventu_security_headers <RULESET_ID>` (e/ou `ventu_cache_rules`) — o ID aparece na URL quando abres o ruleset no painel |
| Erro de expressão WAF | Expressão inválida | Falha no plan (não no apply) — corrigir `expression` no `main.tf` |

> **Dry-run validado (sem token):** `terraform plan` falha no provider com os dois erros acima
> — o placeholder é rejeitado na validação (`main.tf:29`) e um token de formato válido mas
> inválido falha na API (`Invalid access token 9109`, `main.tf:32`). Nenhum dos dois chega a
> gerar plano — o caminho certo é concluir as **Fases 1–2** (pré-flight + token no tfvars) antes do plan.

## Notas

- **Regras existentes na fase:** se a zona já tiver um ruleset de response
  headers criado no painel, o `terraform apply` falha com conflito. Nesse caso,
  importa o existente: `terraform import cloudflare_ruleset.ventu_security_headers <RULESET_ID>`
  (o ID aparece na URL quando abres o ruleset no painel).
- **Ordem das regras:** as expressões são mutuamente exclusivas, mas a Regra 1
  (`/embed/*`) vem primeiro por clareza — nunca reordenar de forma a que o
  catch-all sobrescreva o `/embed/*` (quebraria o widget B2B silenciosamente).
- **HSTS:** se preferires gerir HSTS nas Edge Certificates da Cloudflare,
  remove o header `Strict-Transport-Security` do ruleset — nunca ter os dois
  com valores diferentes.
- **Cache Rules (C1/C2/C3):** agora versionadas no `ventu_cache_rules`
  (fase `http_request_cache_settings`) — porquê ruleset e não transform rules:
  modificar `cache-control` em response header transform rules não muda o
  cache da Cloudflare (ver `docs/SECURITY-HEADERS.md` §3.3). Semânticas:
  `edge_ttl.mode=override_origin` + `default` em segundos, `browser_ttl.mode=respect_origin`,
  `cache=true/false`, e `serve_stale` **omitido** = "While updating" (default,
  como no painel). C3 (`/sw.js`) usa `cache=false` (bypass — o serviço devolve
  `CF-Cache-Status: DYNAMIC` de propósito).
- **Plano free:** máx. 10 Cache Rules ativas (este módulo usa 3) e ficheiro
  cacheável máx. 512 MB (irrelevante para HTML/JSON).
