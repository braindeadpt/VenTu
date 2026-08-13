# ============================================================
# VenTu — S7 HTTP security headers via Cloudflare Ruleset (Terraform)
#
# Versioned equivalent of the two dashboard "Modify Response Header"
# Transform Rules documented in docs/SECURITY-HEADERS.md §3.2.
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
