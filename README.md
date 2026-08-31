# VenTu

Open-source surf and water-sports conditions for Portugal — scores, forecasts, maps, and curated live camera links.

**Live site:** [ventu.surf](https://ventu.surf)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescript.org/)
[![Open-Meteo](https://img.shields.io/badge/Data-Open--Meteo-green)](https://open-meteo.com/)

[Português](#português) · [English](#english)

---

## Português

### O que é

O **VenTu** (Vem + Tu) agrega condições marítimas para **173 spots** em Portugal (continental, Açores, Madeira), com scores por modalidade, previsão horária, mapa interactivo, Dawn Patrol, notícias resumidas por IA e **links para livecams** (Surftotal, MEO Beachcam) em **37 spots** curados.

### Funcionalidades

- Condições actualizadas a cada **3 horas** (GitHub Actions + Open-Meteo)
- Scores por desporto (surf, kitesurf, windsurf, bodyboard, foil, SUP, big wave, …)
- Mapa fullscreen com filtros por região e modalidade
- Página de spot: condições, previsão, janelas, localização, câmara (quando curada)
- Alertas por email quando o spot atinge condições definidas
- Índice [`/livecams`](https://ventu.surf/pt/livecams/) — links externos verificados
- UI em **PT** e **EN**

### Stack

| Camada | Tecnologia |
|--------|------------|
| App | Next.js 16, React 18, TypeScript |
| UI | Tailwind CSS 3.4, Lucide, Geist + Space Grotesk |
| Mapa | Leaflet, MarkerCluster |
| Dados mar | Open-Meteo Marine API (DWD EWAM · ECMWF WAM · GFS Wave · GWAM) |
| Feedback / alertas | Supabase |
| Notícias / Dawn Patrol | Gemini + Groq + Cerebras (opcional) |
| Deploy | GitHub Pages (static export) |

### Início rápido

```bash
git clone https://github.com/braindeadpt/VenTu.git
cd VenTu
npm install
cp .env.example .env.local   # opcional: Supabase, Gemini, analytics
npm run dev                  # http://localhost:3000
```

Build de produção (gera OG image PNG + export estático):

```bash
npm run build
```

### Variáveis de ambiente

Copia `.env.example` para `.env.local`. O site funciona sem secrets (dados em `public/data/` gerados pelo CI).

| Variável | Obrigatória | Uso |
|----------|-------------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Não | Feedback, contribuições, alertas |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Não | Idem |
| `GEMINI_API_KEY` | Não | Notícias e Dawn Patrol |
| `NEXT_PUBLIC_GOATCOUNTER_CODE` | Não | Analytics privacy-first |
| `RESEND_API_KEY` | Não | Alertas por email |

### Scripts úteis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | OG PNG + build estático |
| `npm test` | Testes unitários (Vitest) |
| `npm run test:e2e` | E2E (Playwright) |
| `npm run data:update` | Condições + observações + índice + notícias |
| `npm run sitemap:generate` | Regenerar `public/sitemap.xml` |
| `npm run og:generate` | Regenerar `public/og-image.png` + `public/images/og/*.png` (previews sociais) |
| `npm run dawn-patrol:generate` | Dawn Patrol diário |
| `npm run spots:validate` | Validar `src/lib/spots.ts` |
| `npm run alerts:preflight` | Verificar setup alertas email |

### Estrutura do projecto

```
src/
  app/[locale]/       # Rotas (spots, mapa, news, livecams, …)
  components/         # UI (layout, homepage, spots, …)
  lib/                # Lógica (scores, spots, i18n, seo.ts, …)
public/
  data/               # JSON gerado pelo CI (conditions, forecasts, …)
  og-image.png        # Imagem Open Graph (WhatsApp, Facebook, X)
scripts/              # Pipelines de dados e auditoria
supabase/             # Schemas SQL (alertas, contribuições, feedback)
docs/                 # Roadmap, contexto, design system
  archive/            # Planos e relatórios históricos
```

### Documentação

| Documento | Conteúdo |
|-----------|----------|
| [docs/CONTEXT.md](docs/CONTEXT.md) | Arquitectura, CI, convenções |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Prioridades e estado das fases |
| [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) | Tokens, componentes, voz PT-PT |
| [docs/ALERTS.md](docs/ALERTS.md) | Alertas por email |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Como contribuir (spots, livecams) |

### Livecams

Sem embeds de terceiros (iframes bloqueados). Nos spots curados, a secção «Câmara ao vivo» abre o stream **no site do operador**. Para adicionar um spot, edita `src/lib/spotLivecams.ts`.

### Créditos e atribuição

- [Open-Meteo](https://open-meteo.com/) — previsões mar e tempo, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Ensemble multi-modelo: ondas por [DWD EWAM](https://www.dwd.de/) e [ECMWF WAM](https://www.ecmwf.int/) (CC-BY), NOAA GFS Wave/GWAM; vento por DWD ICON-EU, ECMWF IFS, GFS e Météo-France.
- [IPMA](https://www.ipma.pt/) — observações, avisos e radar (dados públicos)
- [IH](https://www.hidrografico.pt/) — boias ondógrafo e marés (CC-BY 4.0)
- [Google Gemini](https://ai.google.dev/) — notícias & Dawn Patrol (opcional)
- [Lucide](https://lucide.dev/) — ícones
- Operadores de câmaras ao vivo: [Surftotal](https://www.surftotal.com/), [MEO Beachcam](https://beachcam.meo.pt/)

### Contribuir

Issues e PRs são bem-vindos. Lê [CONTRIBUTING.md](CONTRIBUTING.md) antes de submeter.

---

## English

### What it is

**VenTu** aggregates marine conditions for **173 spots** in Portugal, with per-sport scores, hourly forecast, interactive map, Dawn Patrol, AI-summarized news, and **curated live camera links** on **37 spots**.

### Features

- Conditions updated every **3 hours** (GitHub Actions + Open-Meteo)
- Multi-sport scores, regional map filters, email alerts
- Spot pages: conditions, forecast, windows, location, live cam (when curated)
- [`/livecams`](https://ventu.surf/en/livecams/) index — verified external links
- **PT** and **EN** UI

### Quick start

```bash
git clone https://github.com/braindeadpt/VenTu.git
cd VenTu
npm install
cp .env.example .env.local
npm run dev
```

### Documentation

See the Portuguese [Documentação](#documentação) table — [CONTEXT](docs/CONTEXT.md), [ROADMAP](docs/ROADMAP.md), [CONTRIBUTING](CONTRIBUTING.md).

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

[MIT](LICENSE)

## Credits

- [Open-Meteo](https://open-meteo.com/) — marine & weather forecasts, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Multi-model ensemble: waves by [DWD EWAM](https://www.dwd.de/) & [ECMWF WAM](https://www.ecmwf.int/) (CC-BY), NOAA GFS Wave/GWAM; wind by DWD ICON-EU, ECMWF IFS, GFS & Météo-France.  
- [IPMA](https://www.ipma.pt/) — observations, warnings & radar (public data)  
- [IH](https://www.hidrografico.pt/) — wave buoys & tides (CC-BY 4.0)  
- [Google Gemini](https://ai.google.dev/) — news & Dawn Patrol (optional)  
- [Lucide](https://lucide.dev/) — icons  
- Live camera operators: [Surftotal](https://www.surftotal.com/), [MEO Beachcam](https://beachcam.meo.pt/)
