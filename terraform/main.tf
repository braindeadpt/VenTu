# ============================================================
# VenTu — S7 HTTP security headers + cache rules via Cloudflare
# Ruleset (Terraform)
#
# Versioned equivalents of:
#   - the two dashboard "Modify Response Header" Transform Rules
#     (docs/SECURITY-HEADERS.md §3.2, phase http_response_headers_transform)
#   - the three Cache Rules C1/C2/C3 (docs/SECURITY-HEADERS.md §3.3,
#     phase http_request_cache_settings)
#
# Prerequisite (DNS): ventu.surf must already be on Cloudflare with the
# proxy (orange cloud) enabled — see docs/SECURITY-HEADERS.md §3.1.
# ============================================================

terraform {
  required_version = ">= 1.5"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

provider "cloudflare" {
  # Token with Zone > Transform Rules: Edit (and Zone: Read) permission.
  # Prefer the CLOUDFLARE_API_TOKEN env var over a literal in tfvars.
  api_token = var.cloudflare_api_token
}

data "cloudflare_zone" "ventu" {
  name = var.zone_name
}

# Phase http_response_headers_transform == "Modify Response Header" rules.
# Rules run in order; the two expressions below are mutually exclusive, so
# rule 2 never overwrites rule 1 on /embed/*.
resource "cloudflare_ruleset" "ventu_security_headers" {
  zone_id = data.cloudflare_zone.ventu.id
  name    = "ventu-security-headers"
  kind    = "zone"
  phase   = "http_response_headers_transform"

  # ── Regra 1: /embed/* — widget B2B de escolas mantém-se iframeable ──
  # (footgun documentado em public/_headers: nunca definir X-Frame-Options
  #  nem frame-ancestors 'none' aqui — quebra o iframe dos clientes B2B)
  rules {
    action = "rewrite"
    action_parameters {
      headers {
        name      = "Content-Security-Policy"
        operation = "set"
        # trimspace(): o heredoc de variables.tf preserva a indentação (<<- só tira tabs)
        value = trimspace(var.csp_embed)
      }
      headers {
        name      = "X-Content-Type-Options"
        operation = "set"
        value     = "nosniff"
      }
      headers {
        name      = "Referrer-Policy"
        operation = "set"
        value     = "strict-origin-when-cross-origin"
      }
      headers {
        name      = "X-Frame-Options"
        operation = "remove"
      }
    }
    expression  = <<-EOT
      starts_with(http.request.uri.path, "/embed/")
    EOT
    description = "S7: /embed/* iframeable (frame-ancestors *) — B2B school widget"
    enabled     = true
  }

  # ── Regra 2: catch-all — anti-clickjacking + headers de segurança ──
  rules {
    action = "rewrite"
    action_parameters {
      headers {
        name      = "Content-Security-Policy"
        operation = "set"
        # trimspace(): o heredoc de variables.tf preserva a indentação (<<- só tira tabs)
        value = trimspace(var.csp_default)
      }
      headers {
        name      = "X-Frame-Options"
        operation = "set"
        value     = "DENY"
      }
      headers {
        name      = "X-Content-Type-Options"
        operation = "set"
        value     = "nosniff"
      }
      headers {
        name      = "X-XSS-Protection"
        operation = "set"
        value     = "1; mode=block"
      }
      headers {
        name      = "Referrer-Policy"
        operation = "set"
        value     = "strict-origin-when-cross-origin"
      }
      headers {
        name      = "Permissions-Policy"
        operation = "set"
        value     = "camera=(), microphone=(), geolocation=(self), payment=(), usb=()"
      }
      # Nota HSTS: se preferires gerir HSTS nas Edge Certificates da Cloudflare,
      # remove esta linha — nunca teres os dois com valores diferentes.
      headers {
        name      = "Strict-Transport-Security"
        operation = "set"
        value     = "max-age=31536000; includeSubDomains; preload"
      }
      # O GitHub Pages envia Access-Control-Allow-Origin: * em todas as
      # respostas — sem CORS aberto necessário (o worker /obs tem o seu).
      headers {
        name      = "Access-Control-Allow-Origin"
        operation = "remove"
      }
    }
    expression  = <<-EOT
      not starts_with(http.request.uri.path, "/embed/")
    EOT
    description = "S7: catch-all security headers (frame-ancestors 'none')"
    enabled     = true
  }
}

# ────────────────────────────────────────────────────────────────
# Cache Rules (phase http_request_cache_settings) — docs/SECURITY-HEADERS.md §3.3
#
# Espelho Terraform das 3 Cache Rules do painel (Rules → Cache Rules).
# Necessárias porque modificar `cache-control` via response header transform
# rules NÃO muda o cache edge (a Cloudflare avalia o caching antes das
# modificações de resposta).
# ────────────────────────────────────────────────────────────────
resource "cloudflare_ruleset" "ventu_cache_rules" {
  zone_id = data.cloudflare_zone.ventu.id
  name    = "ventu-cache-rules"
  kind    = "zone"
  phase   = "http_request_cache_settings"

  # ── C1: /_next/static/* — imutável, 1 ano ──
  # (serve_stale omitido = default "While updating", como no painel)
  rules {
    action = "set_cache_settings"
    action_parameters {
      cache = true
      edge_ttl {
        mode    = "override_origin"
        default = 31536000 # 1 ano — ignora o cache-control do origin
      }
      browser_ttl {
        mode = "respect_origin"
      }
    }
    expression  = "starts_with(http.request.uri.path, \"/_next/static/\")"
    description = "C1: /_next/static/* immutable — edge TTL 1y"
    enabled     = true
  }

  # ── C2: /data/* — SWR 5 min ──
  # (origin GitHub Pages envia max-age=600 para tudo; encurta-se o frescor)
  rules {
    action = "set_cache_settings"
    action_parameters {
      cache = true
      edge_ttl {
        mode    = "override_origin"
        default = 300 # 5 minutos
      }
      browser_ttl {
        mode = "respect_origin"
      }
    }
    expression  = "starts_with(http.request.uri.path, \"/data/\")"
    description = "C2: /data/* — edge TTL 5min (stale-while-updating)"
    enabled     = true
  }

  # ── C3: /sw.js — nunca cachear no edge (bypass) ──
  rules {
    action = "set_cache_settings"
    action_parameters {
      cache = false
    }
    expression  = "ends_with(http.request.uri.path, \"/sw.js\")"
    description = "C3: /sw.js — bypass edge cache (o SW protege-se no cliente)"
    enabled     = true
  }
}
