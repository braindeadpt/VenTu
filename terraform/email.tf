# ============================================================
# VenTu — recepção de email @ventu.surf via Cloudflare Email Routing
#
# ESTADO: provisionado pelo painel (2026-10-07), NÃO por este ficheiro.
# Este .tf espelha o que ficou live na Cloudflare — para adopção real
# (gestão IaC) cada recurso precisa de `terraform import`, senão um
# `apply` falha com "record already exists" nos registos geridos.
#
# O que ficou configurado no painel:
#   - Email Routing activo na zona
#   - Routing rule: contacto@ventu.surf → busntech.net@gmail.com
#     (destino já Verified; catch-all continua Drop/Disabled)
#   - DNS: MX route1/2/3.mx.cloudflare.net (prioridades reais 79/41/34 —
#     gerados pela Cloudflare, marcados "Locked"), DKIM
#     cf2024-1._domainkey (Locked) e SPF apex (Unlocked)
#   - _dmarc.ventu.surf actualizado à mão:
#     "v=DMARC1; p=none; rua=mailto:contacto@ventu.surf"
#
# Contexto (verificado por dig antes da mudança):
#   - Envio: Resend com DKIM `resend._domainkey` + SPF/MX de feedback em
#     `send.ventu.surf` (SES eu-west-1) — não tocado, envio usa envelope
#     do subdomínio send., o apex SPF é só para o Email Routing.
#   - Recepção antes: apex sem MX → bounce em todo o *@ventu.surf.
#
# Se algum dia se quiser gerir isto daqui:
#   - Token precisa de `Zone > DNS: Edit` + `Email Routing: Edit`
#     (o token de Transform Rules não chega) + `cloudflare_account_id`.
#   - Importar primeiro cada recurso (MX/DKIM/SPF são "Locked" no painel):
#       terraform import cloudflare_record.mx_route1[0] <zone_id>/<record_id>
# ============================================================

# ── Gate: inerte até as vars estarem preenchidas (e nesse caso ainda ──
# falta o import — ver header). Não afecta os rulesets de main.tf.
locals {
  email_routing_enabled = var.cloudflare_account_id != "" && var.email_forward_to != ""
}

# ── Destino do reencaminhamento (caixa pessoal — var, nunca literal). ──
resource "cloudflare_email_routing_address" "destino" {
  count      = local.email_routing_enabled ? 1 : 0
  account_id = var.cloudflare_account_id
  email      = var.email_forward_to
}

resource "cloudflare_email_routing_settings" "ventu" {
  count   = local.email_routing_enabled ? 1 : 0
  zone_id = data.cloudflare_zone.ventu.id
  enabled = true
}

# ── contacto@ventu.surf → caixa pessoal ──
resource "cloudflare_email_routing_rule" "contacto" {
  count   = local.email_routing_enabled ? 1 : 0
  zone_id = data.cloudflare_zone.ventu.id
  name    = "contacto@ventu.surf -> inbox"
  enabled = true

  matcher {
    type  = "literal"
    field = "to"
    value = "contacto@ventu.surf"
  }

  action {
    type  = "forward"
    value = [cloudflare_email_routing_address.destino[0].email]
  }
}

# ── MX do Email Routing — prioridades REAIS geradas pela Cloudflare ──
# (79/41/34, não os 6/76/98 da doc antiga). Locked no painel.
resource "cloudflare_record" "mx_route1" {
  count    = local.email_routing_enabled ? 1 : 0
  zone_id  = data.cloudflare_zone.ventu.id
  name     = "ventu.surf"
  type     = "MX"
  content  = "route1.mx.cloudflare.net"
  priority = 79
  ttl      = 1 # auto
}

resource "cloudflare_record" "mx_route2" {
  count    = local.email_routing_enabled ? 1 : 0
  zone_id  = data.cloudflare_zone.ventu.id
  name     = "ventu.surf"
  type     = "MX"
  content  = "route2.mx.cloudflare.net"
  priority = 41
  ttl      = 1
}

resource "cloudflare_record" "mx_route3" {
  count    = local.email_routing_enabled ? 1 : 0
  zone_id  = data.cloudflare_zone.ventu.id
  name     = "ventu.surf"
  type     = "MX"
  content  = "route3.mx.cloudflare.net"
  priority = 34
  ttl      = 1
}

# ── DKIM do Email Routing (cf2024-1._domainkey — a CF re-assina o ──
# correio reencaminhado). Locked/gerido pelo serviço; a chave pública é
# account-specific — aqui fica só documentado que existe; para gerir via
# TF o valor real sai do painel (Email Routing → Settings → DNS records).
# ── SPF do apex para o reencaminhamento Cloudflare (Unlocked). ──
# O envio da app NÃO usa o apex (envelope-from é send.ventu.surf, com o
# seu próprio SPF para SES) — este registo só serve o Email Routing.
resource "cloudflare_record" "spf_mx_cloudflare" {
  count   = local.email_routing_enabled ? 1 : 0
  zone_id = data.cloudflare_zone.ventu.id
  name    = "ventu.surf"
  type    = "TXT"
  content = "v=spf1 include:_spf.mx.cloudflare.net ~all"
  ttl     = 1
}

# ── DMARC com rua= → caixa nova (já editado no painel). ──
# Mantém p=none — endurecer para quarantine é decisão posterior, depois
# de algumas semanas de relatórios limpos.
# Para adoptar: terraform import cloudflare_record.dmarc[0] <zone>/<id>
resource "cloudflare_record" "dmarc" {
  count   = local.email_routing_enabled ? 1 : 0
  zone_id = data.cloudflare_zone.ventu.id
  name    = "_dmarc"
  type    = "TXT"
  content = "v=DMARC1; p=none; rua=mailto:${var.email_dmarc_rua}"
  ttl     = 1
}
