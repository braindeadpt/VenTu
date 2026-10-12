# GitHub Setup Guide

## Branch Protection Rules

### Settings → Branches → Add rule for `main`

```
Pattern: main
☑ Require a pull request before merging
   - Require approving reviews: 1
   - Dismiss stale reviews: ✓
   - Require review from Code Owners: off (optional)
☑ Require status checks to pass before merging
   - Add required checks: (leave empty for now, or add 'build' when available)
☑ Require branches to be up to date before merging
☑ Do not allow bypassing the above settings
```

### Enable Issues (optional)

Settings → Features → ✓ Issues (enable for project tracking)

---

## Creating First Release

```bash
# Local
git tag -a v1.0.0 -m "Initial stable release"
git push origin v1.0.0
```

Or in GitHub:
- Releases → Draft a new release
- Tag: v1.0.0
- Title: VenTu v1.0.0 — Stable Release
- Description: List major features and fixes from audit

---

## Add Collaborators (optional)

Settings → Collaborators → Add people

---

## Enable GitHub Pages

Settings → Pages:
- Source: Deploy from a branch
- Branch: gh-pages / (root)
- Or: GitHub Actions (if using workflow)

---

## Wiki Setup

Create wiki pages for:
- Contributing guidelines
- API documentation
- Spot submission guide

---

## Email alerts (E1)

See **[docs/ALERTS.md](./ALERTS.md)** for full setup.

Required GitHub Actions secrets (in addition to deploy):

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM` (optional, e.g. `VenTu <alerts@ventu.surf>`)

Run locally: `npm run alerts:preflight` then `npm run alerts:evaluate`.

---

## External API keys — health checks

The workflow **`.github/workflows/api-keys.yml`** (semanal + manual) diagnostica
**todas** as dependências externas com key: MeteoAlarm (`METEOALARM_API_KEY`),
IH (`IH_API_KEY`), Ecowitt (`ECOWITT_*`) e Resend (`RESEND_API_KEY`). Uma key
configurada mas inválida/expirada falha o job cedo; ausente → aviso (não
bloqueia). Localmente:

- `npm run warnings:test-key` · `npm run buoys:test-key` ·
  `npm run ecowitt:test-key` · `npm run alerts:test-key`

---

## Fluxo com agentes (Devin)

Uma issue com a etiqueta `agent:ready` abre uma sessão Devin
(`.github/workflows/devin-dispatch.yml`), que implementa a issue num PR; o
`.github/workflows/agent-verify.yml` corre build, specs e screenshots 390/1440
na nuvem e comenta o resultado no PR. O `ci.yml` continua a ser o gate de merge.

Secrets e variáveis (Settings → Secrets and variables → Actions):

- `DEVIN_API_KEY` — chave de um service user com `org.devins.use`
- `DEVIN_ORG_ID` — id da organização Devin (`org-…`)
- `DEVIN_MAX_ACU` (variável, opcional) — limite de ACUs por sessão (default 20)

Etiquetas:

- `agent:ready` — numa issue, aplicada por admin/maintain: dispara o Devin.
- `agent:working` — substitui automaticamente `agent:ready` quando a sessão arranca.
- `agent:verify` — num PR do próprio repo: corre o `agent-verify` a cada push,
  com as linhas `agent-verify-specs:` e `agent-verify-routes:` do corpo do PR.

Playbook do agente: **[docs/agents/DEVIN.md](./agents/DEVIN.md)** ·
prompts prontos: **[docs/agents/PROMPTS.md](./agents/PROMPTS.md)**.

---

## Quick Setup Checklist

- [ ] Enable branch protection for `main`
- [ ] Create v1.0.0 release
- [ ] Enable GitHub Pages deployment
- [ ] Add to repository topics: `surf` `kitesurf` `windsurf` `portugal` `weather` `nextjs` `typescript`
- [ ] Add funding link (optional): GitHub Sponsors

---

## Topics (add in repo settings)

```
surf
kitesurf
windsurf
portugal
water-sports
weather-api
nextjs
typescript
open-source