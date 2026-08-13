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

## Pré-requisitos (fazer PRIMEIRO)

1. **DNS já proxied na Cloudflare** — `ventu.surf` adicionado à Cloudflare com
   o proxy ligado (nuvem laranja) e SSL/TLS em *Full (strict)*. Sem isto, o
   ruleset não tem efeito (o tráfego nem passa pela Cloudflare).
   Passos detalhados: `docs/SECURITY-HEADERS.md` §3.1.
2. **API token Cloudflare** com permissões `Zone > Transform Rules: Edit` e
   `Zone > Zone: Read` na zona `ventu.surf`.
3. **Terraform CLI ≥ 1.5** (`terraform version`).

## Aplicação passo a passo

```bash
# 1. Config local (nunca commitar terraform.tfvars)
cd terraform
cp terraform.tfvars.example terraform.tfvars
#    → preencher cloudflare_api_token e zone_name
#    (ou: export CLOUDFLARE_API_TOKEN=... e remover a linha do tfvars)

# 2. Inicializar (descarrega o provider cloudflare/cloudflare)
terraform init

# 3. Rever o plano — deve criar 2 cloudflare_ruleset:
#    1. ventu_security_headers (fase http_response_headers_transform, 2 rules)
#    2. ventu_cache_rules (fase http_request_cache_settings, 3 rules)
terraform plan
#    Sem erros de expressão/fase? As expressões WAF válidas são validadas
#    nesta fase.

# 4. Aplicar
terraform apply
```

## Validação após aplicar

```bash
# Da raiz do repo:
bash scripts/check-security-headers.sh        # exit 0 = tudo ok
# ou: npm run check:headers
```

Esperado:
- `/pt/` (e qualquer rota fora de `/embed/*`) → `Content-Security-Policy` com
  `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, HSTS, e **sem**
  `Access-Control-Allow-Origin`
- `/embed/spot/moledo/` → CSP com `frame-ancestors *`, **sem** `X-Frame-Options`

## Rollback

```bash
terraform destroy        # remove os 2 rulesets (headers + cache deixam de ser servidos)
# Alternativa rápida no painel: Rules → Transform Rules / Cache Rules → desligar
```

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
