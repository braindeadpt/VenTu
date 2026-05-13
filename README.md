# 🌊 VenTu

> **A modern, open-source platform for real-time water sports conditions in Portugal**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC)](https://tailwindcss.com/)
[![Open-Meteo](https://img.shields.io/badge/Data-Open--Meteo-green)](https://open-meteo.com/)

[🇵🇹 Português](#português) | [🇬🇧 English](#english)

---

## 🇵🇹 Português

### 🏄 O que é o VenTu?

O **VenTu** é uma plataforma **gratuita e open-source** que fornece condições em tempo real para desportos náuticos em Portugal. Inclui dados de ondas, vento, temperatura da água e notícias automáticas sobre surf, kitesurf, windsurf e big wave.

### ✨ Funcionalidades

- 🌊 **Condições em tempo real** - Ondas, vento, temperatura da água
- 📊 **Previsão 7 dias** - Gráficos interativos com Recharts
- 📰 **Notícias automáticas** - Resumidas por IA (Gemini Flash)
- 🗺️ **80 spots portugueses** - Nazaré, Peniche, Guincho, Algarve, Açores, Madeira, Centro, Norte, Sul e mais
- 🌐 **Bilingue** - Português e Inglês para turistas
- 📱 **Responsivo** - Funciona em mobile e desktop
- ⚡ **Atualização automática** - A cada 3 horas via GitHub Actions

### 🚀 Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 14 + React 18 + TypeScript |
| Styling | Tailwind CSS 3.4 |
| Charts | Recharts |
| Dados | Open-Meteo Marine API (grátis) |
| Chat | Supabase (PostgreSQL + Realtime) |
| IA | Google Gemini Flash (grátis) |
| Deploy | GitHub Pages / Vercel |

### 📦 Instalação

```bash
# Clone o repositório
git clone https://github.com/braindeadpt/ventu.git
cd ventu

# Instalar dependências
npm install

# Desenvolvimento local
npm run dev

# Build para produção
npm run build
```

### 🔑 Configurar Gemini API (Opcional)

Para notícias automáticas com IA:

1. Vai a [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Cria uma API Key gratuita
3. Adiciona como secret no GitHub: `Settings > Secrets > GEMINI_API_KEY`

### 🤝 Contribuir

Contribuições são bem-vindas! Abre um PR ou issue no GitHub.

---

## 🇬🇧 English

### 🏄 What is VenTu?

**VenTu** is a **free, open-source** platform providing real-time conditions for water sports in Portugal. Includes wave, wind, water temperature data and automated news about surf, kitesurf, windsurf and big wave.

### ✨ Features

- 🌊 **Real-time conditions** - Waves, wind, water temperature
- 📊 **7-day forecast** - Interactive charts with Recharts
- 📰 **Automated news** - AI-summarized by Gemini Flash
- 🗺️ **80 Portuguese spots** - Nazaré, Peniche, Guincho, Algarve, Azores, Madeira, and more
- 🌐 **Bilingual** - Portuguese and English for tourists
- 📱 **Responsive** - Works on mobile and desktop
- ⚡ **Auto-updates** - Every 3 hours via GitHub Actions

### 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 + React 18 + TypeScript |
| Styling | Tailwind CSS 3.4 |
| Charts | Recharts |
| Data | Open-Meteo Marine API (free) |
| AI | Google Gemini Flash (free) |
| Deploy | GitHub Pages / Vercel |

### 📦 Installation

```bash
# Clone the repository
git clone https://github.com/braindeadpt/ventu.git
cd ventu

# Install dependencies
npm install

# Local development
npm run dev

# Production build
npm run build
```

### 🔑 Setup Gemini API (Optional)

For automated AI news:

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a free API Key
3. Add as GitHub secret: `Settings > Secrets > GEMINI_API_KEY`

### 🤝 Contributing

Contributions are welcome! Open a PR or issue on GitHub.

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file

## 🙏 Credits

- Data: [Open-Meteo](https://open-meteo.com/) - Free Weather API
- AI: [Google Gemini](https://ai.google.dev/) - Generative AI
- Icons: [Lucide](https://lucide.dev/) - Beautiful icons

---

**Made with ❤️ for the Portuguese water sports community**
