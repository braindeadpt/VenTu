# Terraform — S7 HTTP security headers (Cloudflare Ruleset)

Versão **versionável** (infra-as-code) das 2 Transform Rules do
[`docs/SECURITY-HEADERS.md`](../docs/SECURITY-HEADERS.md) §3.2 — alternativa ao
painel do Cloudflare para o mesmo resultado.

| Ficheiro | O que é |
|---|---|
| `main.tf` | `cloudflare_ruleset` na fase `http_response_headers_transform` com as 2 regras (catch-all + `/embed/*`) |
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

# 3. Rever o plano — deve criar 1 cloudflare_ruleset com 2 rules
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
terraform destroy        # remove o ruleset (headers deixam de ser servidos)
# Alternativa rápida no painel: Rules → Transform Rules → desligar as 2 regras
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
- **Cache-Control:** as regras de cache do `public/_headers` não estão aqui —
  a modificação de `cache-control` via response headers transform rules não
  muda o cache da Cloudflare (ver `docs/SECURITY-HEADERS.md` §3.3).
