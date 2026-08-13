variable "cloudflare_api_token" {
  description = "Cloudflare API token — Zone > Transform Rules:Edit + Zone:Read"
  type        = string
  sensitive   = true
}

variable "zone_name" {
  description = "Zone (domain) na Cloudflare — ex.: ventu.surf"
  type        = string
}

# ⚠️ Mantém os CSPs abaixo em sincronia com o CSP_META de src/components/CSPMeta.tsx
# (a meta permanece como fallback; header + meta idênticos = intersecção sem conflito).
# Única diferença entre os dois: frame-ancestors.

variable "csp_default" {
  description = "CSP do site principal — frame-ancestors 'none' (anti-clickjacking via header)"
  type        = string
  default     = <<-EOT
    default-src 'self'; script-src 'self' 'unsafe-inline' https://gc.zgo.at; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com https://*.supabase.co; connect-src 'self' https://gc.zgo.at https://*.goatcounter.com https://*.supabase.co wss://*.supabase.co https://api.open-meteo.com https://marine-api.open-meteo.com https://*.workers.dev; frame-src 'self' https://www.openstreetmap.org https://www.youtube-nocookie.com https://www.youtube.com https://www.weatherlink.com https://embed.cdn-surfline.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
  EOT
}

variable "csp_embed" {
  description = "CSP de /embed/* — frame-ancestors * (widget B2B iframeable)"
  type        = string
  default     = <<-EOT
    default-src 'self'; script-src 'self' 'unsafe-inline' https://gc.zgo.at; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com https://*.supabase.co; connect-src 'self' https://gc.zgo.at https://*.goatcounter.com https://*.supabase.co wss://*.supabase.co https://api.open-meteo.com https://marine-api.open-meteo.com https://*.workers.dev; frame-src 'self' https://www.openstreetmap.org https://www.youtube-nocookie.com https://www.youtube.com https://www.weatherlink.com https://embed.cdn-surfline.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors *; upgrade-insecure-requests
  EOT
}
