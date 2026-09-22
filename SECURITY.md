# Política de segurança · Security policy

Este é um projeto estático (GitHub Pages) + pipelines de dados + um worker
Cloudflare + Supabase. Só a branch `main` e o site publicado em
<https://ventu.surf> são suportados.

## Como reportar uma vulnerabilidade

**Não abras uma issue pública.** Usa o *Private vulnerability reporting* do
GitHub (já activo neste repositório):

➡️ <https://github.com/braindeadpt/VenTu/security/advisories/new>

Inclui, se possível:

- descrição do problema e do impacto (ex.: XSS, RLS bypass, abuso de relay);
- passos mínimos de reprodução (URL, payload, pedido HTTP, snippet);
- superfície afectada (site, `scripts/`, `worker/`, `supabase/`, Actions);
- prova de conceito e sugestão de correcção, se tiveres.

## Âmbito

Dentro do âmbito:

- o site publicado (rotas, JSON-LD, atribuições, headers/CSP, service worker);
- os pipelines de dados (`scripts/`, `.github/workflows/`) e os workflows
  que fazem commit/push automático;
- o worker Cloudflare (`worker/`) e o Terraform associado;
- o Supabase (RLS, funções `SECURITY DEFINER`, rate limits, subscrições de
  alertas e relay de email);
- segredos expostos por engano (chaves em commits, logs ou artefactos).

Fora do âmbito:

- vulnerabilidades de dependências de terceiros (reporta *upstream*; nós
  actualizamos via Dependabot);
- engenharia social, DoS volumétrico e ataques a infraestrutura que não
  operamos (GitHub, Cloudflare, Supabase, Open-Meteo, IPMA, IH).

## Expectativas de resposta

| Fase | Prazo |
|---|---|
| Confirmação de recepção | ~72 horas |
| Triagem inicial e severidade | ~7 dias |
| Correcção | depende da severidade; coordenamos a divulgação contigo |

Creditamos quem reportar (com o teu consentimento) no *advisory* e nas notas
de lançamento.

---

## English (short version)

Static site + data pipelines; only `main` and <https://ventu.surf> are
supported. Report privately via
<https://github.com/braindeadpt/VenTu/security/advisories/new> — never in a
public issue. Include impact, minimal reproduction steps and the affected
surface. No third-party dependency reports (send those upstream), no social
engineering or volumetric DoS. We acknowledge within ~72 h and triage within
~7 days.
