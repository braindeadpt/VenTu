# VenTu

Open-source surf and water-sports conditions for Portugal — scores, forecasts, maps, and curated live camera links.

**Live site:** [ventu.surf](https://ventu.surf)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org/)
[![Open-Meteo](https://img.shields.io/badge/Data-Open--Meteo-green)](https://open-meteo.com/)

[Português](#português) · [English](#english)

---

## Português

### O que é

O **VenTu** agrega condições marítimas (ondas, vento, temperatura da água, maré) para **167 spots** em Portugal, com scores por modalidade, previsão horária, mapa interactivo, notícias resumidas por IA e **links para livecams** em direto (Surftotal, MEO Beachcam) nos spots mais populares.

### Funcionalidades

- Condições actualizadas a cada **3 horas** (pipeline GitHub Actions + Open-Meteo)
- Scores por desporto (surf, kitesurf, windsurf, bodyboard, foil, SUP, big wave, …)
- Mapa com filtros por região e modalidade
- Página de spot: condições, previsão, janelas, localização, câmara (quando curada)
- Índice [`/livecams`](https://ventu.surf/pt/livecams/) — links externos verificados
- UI em **PT** e **EN**

### Stack

| Camada | Tecnologia |
|--------|------------|
| App | Next.js 16, React 18, TypeScript |
| UI | Tailwind CSS 3.4, Lucide |
| Mapa | Leaflet, MarkerCluster |
| Dados mar | Open-Meteo Marine API |
| Feedback / alertas | Supabase |
| Notícias | Gemini (opcional) + RSS |
| Deploy | GitHub Pages (static export) |

### Início rápido

```bash
git clone https://github.com/braindeadpt/VenTu.git
cd VenTu
npm install
cp .env.example .env.local   # opcional: Supabase, Gemini, analytics
npm run dev                  # http://localhost:3000
```

Build de produção:

```bash
npm run build
```

### Variáveis de ambiente

Copia `.env.example` para `.env.local`. O site funciona sem secrets (dados em `public/data/` gerados pelo CI).

| Variável | Obrigatória | Uso |
|----------|-------------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Não | Formulário de feedback e contribuições |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Não | Idem |
| `GEMINI_API_KEY` | Não | Geração de notícias (`npm run news:generate`) |
| `NEXT_PUBLIC_GOATCOUNTER_CODE` | Não | Analytics privacy-first |
| `RESEND_API_KEY` | Não | Alertas por email |

### Scripts úteis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build estático |
| `npm test` | Testes unitários (Vitest) |
| `npm run test:e2e` | E2E (Playwright) |
| `npm run conditions:update` | Actualizar `public/data/conditions.json` |
| `npm run data:update` | Condições + notícias |
| `npm run spots:validate` | Validar `src/lib/spots.ts` |

### Estrutura do projecto

```
src/
  app/[locale]/     # Rotas (spots, compare, news, livecams, …)
  components/       # UI e secções (mapa, spot detail, …)
  lib/              # Lógica (scores, spots, i18n, spotLivecams.ts)
  data/             # Dados estáticos gerados (se aplicável)
public/data/        # conditions.json, forecasts.json (CI)
scripts/            # Pipelines de dados e auditoria
docs/               # Roadmap, contexto, design system
```

### Documentação

- [docs/CONTEXT.md](docs/CONTEXT.md) — arquitectura e convenções
- [docs/ROADMAP.md](docs/ROADMAP.md) — prioridades e estado das fases
- [CONTRIBUTING.md](CONTRIBUTING.md) — como contribuir (spots, livecams, scores)

### Livecams

Não usamos embeds de terceiros (Windy timelapse, iframes MEO bloqueados). Nos **31 spots curados**, a secção «Câmara ao vivo» abre o stream **no site do operador** (nova janela). Para adicionar um spot, edita `src/lib/spotLivecams.ts`.

### Contribuir

Issues e PRs são bem-vindos. Lê [CONTRIBUTING.md](CONTRIBUTING.md) antes de submeter.

---

## English

### What it is

**VenTu** aggregates marine conditions for **167 spots** in Portugal, with per-sport scores, hourly forecast, interactive map, AI-summarized news, and **curated live camera links** (Surftotal, MEO Beachcam) on popular spots.

### Features

- Conditions updated every **3 hours** (GitHub Actions + Open-Meteo)
- Multi-sport scores, regional map filters
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

### Environment

See `.env.example`. The app runs without secrets using CI-generated files under `public/data/`.

### Documentation

- [docs/CONTEXT.md](docs/CONTEXT.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)

### Live cameras

No third-party embeds. Curated spots link out to the operator’s live stream. Add entries in `src/lib/spotLivecams.ts`.

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

[MIT](LICENSE)

## Credits

- [Open-Meteo](https://open-meteo.com/) — marine weather data  
- [Google Gemini](https://ai.google.dev/) — news summarization (optional)  
- [Lucide](https://lucide.dev/) — icons  
- Live camera operators: [Surftotal](https://www.surftotal.com/), [MEO Beachcam](https://beachcam.meo.pt/)
