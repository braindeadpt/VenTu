# VenTu — Plano de Implementação por Fases (Baseado nas 6 Auditorias)

> **Baseado em:** 6 relatórios de auditoria independentes  
> **Total de problemas identificados:** ~112  
> **Data do plano:** 2026-05-14  
> **Status:** Reorganizado por criticidade e dependências

---

## 🎯 Filosofia do Plano

**Ordem de implementação:**
1. **Segurança primeiro** — o que está partido protege o projeto
2. **Estabilidade** — o que não funciona impede o resto
3. **UX defeitos** — o que frustra utilizadores hoje
4. **UX redesign** — o que eleva o produto
5. **Polish** — o que faz brilhar

**Regras por fase:**
- Cada fase tem ≤8 itens (testável numa sessão)
- Cada fase termina com `npm run build` verde
- Nada avança sem teste visual/manual
- Regressões = parar e corrigir

---

## 🔴 FASE 1: Segurança Crítica (1-2 sessões)

**Fontes:** Security Audit (13 vulns) + Segurança (20 vulns)  
**Risco se não fizer:** Dados apagados, spam massivo, acesso não autorizado ao admin

### 1.1 — Credenciais Hardcoded [CRÍTICO]
- [ ] `src/lib/supabase-config.ts` — remover fallbacks hardcoded (URL + key), exigir env vars
- [ ] `src/app/[locale]/admin/contributions/page.tsx` — remover password `'Ventu2026'` hardcoded ou desativar página admin
- [ ] `.env.example` — adicionar comentário `SERVER-SIDE ONLY` no `GEMINI_API_KEY`
- [ ] `package.json` — `"private": true`

### 1.2 — Row Level Security (RLS) [CRÍTICO]
- [ ] `supabase-contributions.sql` — remover políticas UPDATE/DELETE anónimas na tabela `contributions`
- [ ] `supabase-schema.sql` — adicionar DENY UPDATE/DELETE para anónimos na tabela `messages`
- [ ] Verificar se RLS do messages já tem rate limit server-side (1 msg/10s)

### 1.3 — Sanitização & XSS [ALTO]
- [ ] `src/components/spots/SpotMapInteractive.tsx` — substituir `innerHTML` por DOM API (`textContent`) nos popups do Leaflet
- [ ] `src/components/spots/SpotMapInteractive.tsx` — remover `onmouseover`/`onmouseout` inline dos `divIcon`, usar CSS `:hover`
- [ ] `src/app/layout.tsx` — adicionar `id="theme-script"` ao `dangerouslySetInnerHTML` (mitigação parcial já existe)

### 1.4 — Headers & Configuração [MÉDIO]
- [ ] `next.config.js` — `reactStrictMode: true`
- [ ] `next.config.js` — `compress: true`
- [ ] Meta tags CSP no `<head>` (mitigação parcial para static export)

**Teste de validação:**
- `grep -r "sb_publishable_ihub" src/` → deve dar zero resultados
- `grep -r "Ventu2026" src/` → deve dar zero resultados
- Build verde (`npm run build`)

---

## 🟠 FASE 2: Estabilidade & Performance Crítica (2-3 sessões)

**Fontes:** APIs & Performance (19 problemas) + Performance Audit (15 problemas)  
**Risco se não fizer:** Builds que falham, site sem dados, performance degradada

### 2.1 — API & Dados [CRÍTICO]
- [ ] `public/data/conditions.json` — adicionar seed data real (não vazio `{}`) para fallback quando workflow falha
- [ ] `scripts/update-conditions.js` — implementar retry com backoff exponencial (3 tentativas) nas chamadas Open-Meteo
- [ ] `scripts/update-news.js` — retry com backoff + timeout 30s nas chamadas Gemini API
- [ ] `.github/workflows/update-data.yml` — reduzir frequência de 8x/dia para 4x/dia (a cada 6h)

### 2.2 — Performance — Bundle & Cache [ALTO]
- [ ] `next.config.js` — ativar otimização de imagens (`images.unoptimized: false` + custom loader para static export)
- [ ] `src/lib/openmeteo.ts` — implementar LRU cache com limite (max 100 entradas)
- [ ] `src/components/spots/SpotGridClient.tsx` — dynamic import para `SpotMapInteractive` (reduz bundle inicial)
- [ ] `src/app/layout.tsx` — adicionar `dns-prefetch` + `preconnect` para Open-Meteo, Supabase, Carto CDN

### 2.3 — Client-Side Robustez [MÉDIO]
- [ ] `SpotDetailClient.tsx` + `FavoritesClient.tsx` — cache `conditions.json` com `cache: 'default'` em vez de `no-store`
- [ ] `SpotDetailClient.tsx` — limpar timer do `handleShare` no unmount (memory leak)
- [ ] `ForecastTable.tsx` — substituir hover React state por CSS `:hover` (melhora INP)
- [ ] `src/lib/openmeteo.ts` — reduzir timeout de 10s para 5s

### 2.4 — Mock Data & Freshness [MÉDIO]
- [ ] `src/lib/openmeteo.ts` — quando usar mock data, mostrar badge "⚠ Dados estimados" na UI
- [ ] `SpotDetailClient.tsx` — adicionar timestamp "Atualizado às HH:MM" visível

**Teste de validação:**
- Build passa com `npm run build`
- `conditions.json` tem dados reais (não `{}`)
- Lighthouse Performance sobe de 62-72 para 70-80

---

## 🟡 FASE 3: UX — Defeitos Atuais (3-4 sessões)

**Fonte:** UX/UI Audit — Parte 1 (Defeitos Actuais)  
**Risco se não fizer:** Utilizadores confusos, altos bounce rates, frustração

### 3.1 — Homepage & First Impression
- [ ] Hero: substituir "VenTu" gigante descontextualizado por comunicação clara: "Condições para surf, kitesurf e windsurf em Portugal"
- [ ] "Melhor Spot Hoje": usar lógica agnóstica de desporto ou permitir escolha do desporto principal
- [ ] Adicionar search com autocomplete no hero (fuzzy search em `spots.ts`)

### 3.2 — SpotCard & Glanceability
- [ ] Consolidar os dois `SpotCard` (componente + inline em page.tsx) num só
- [ ] Reduzir densidade de informação: nome, score gauge, 3 stats principais, melhor janela
- [ ] WindCompass: rodar SÓ a seta, não os labels N/S/E/W

### 3.3 — Dados & Visualização
- [ ] ForecastChart: separar eixos (ondas à esquerda, vento à direita) ou usar bandas coloridas
- [ ] ForecastMini: destacar hora atual, adicionar ícones de tendência (↑→↓)
- [ ] LiveTicker: transformar em "Top 3 perto de ti" em vez de marquee infinito
- [ ] MiniMap: aumentar para 256-320px ou remover se não acrescentar valor

### 3.4 — Interação & Filtros
- [ ] Filtros região: sincronizar com URL (`?region=norte&sport=surf`)
- [ ] Filtros: adicionar botão "Limpar filtros" quando nenhum resultado
- [ ] Favoritos: adicionar URL shareable (`?favs=guincho,nazare`)
- [ ] SportSelector: só mostrar desportos compatíveis com o spot atual

### 3.5 — Mobile & Estados
- [ ] Hero mobile: reduzir de 70vh para 50vh
- [ ] Filter bar: adicionar fade-edge ou chevron a indicar scroll horizontal
- [ ] Loading: substituir spinner por skeleton shimmer
- [ ] Stale data: badge "Dados de há X min" quando >30 min
- [ ] Error state: "⚠ Dados em cache" / "⚠ Dados estimados" com retry button

### 3.6 — Microcopy & Acessibilidade
- [ ] Unificar tom de voz (PT-PT consistente, sem abreviações mistas)
- [ ] Adicionar `prefers-reduced-motion` em todas as animações
- [ ] Melhorar contraste em `text-white/30` e `text-white/40`
- [ ] Adicionar skip links para navegação por teclado

**Teste de validação:**
- Testar em mobile (iPhone SE width)
- Testar filtros com URL
- Testar dark mode toggle (se implementado)
- axe-core ou Lighthouse Accessibility >90

---

## 🟢 FASE 4: UX — Componentes Signature (3-4 sessões)

**Fonte:** UX/UI Audit — Parte 3 (Proposta de Redesign)  
**Objetivo:** Linguagem visual única e screenshotable

### 4.1 — Componentes UI Foundation
- [ ] `ScoreGauge` — SVG circular com arco, glow, count-up animation
- [ ] `WaveShape` — curva senoidal com amplitude ∝ height, período ∝ period
- [ ] `SwellRadar` — seta swell + seta wind + linha de costa
- [ ] `WindCompass` — redesign: seta rotaciona, labels fixos, cor por força

### 4.2 — Componentes Compostos
- [ ] `ForecastTable` — estilo Windguru: células coloridas por valor, coluna atual destacada, setas de direção
- [ ] `LiveCam` — embed iframe/snapshot para spots com webcam (Carcavelos, Guincho, Nazaré, etc.)
- [ ] `SpotCard` redesign — ScoreGauge + WaveShape + 4 stats + melhor janela

### 4.3 — Páginas
- [ ] Homepage redesign com novos componentes
- [ ] SpotDetail redesign — layout hierárquico: hero > score > forecast > livecam > mapa > chat
- [ ] Spots index (`/spots`) — grid com filtros sticky

**Teste de validação:**
- Cada componente funciona isoladamente (storybook-style)
- Build verde
- Visual comparison com design proposto

---

## 🔵 FASE 5: Interações & Polish (2-3 sessões)

**Fonte:** UX/UI Audit — Parte 3 (Interações) + BACKLOG.md  
**Objetivo:** Elevar de "site" a "produto"

### 5.1 — Interações Avançadas
- [ ] Search com autocomplete + Cmd+K shortcut
- [ ] Geolocation opcional ("Permitir localização?") + ordenar por distância
- [ ] Unit toggle (kt ↔ km/h ↔ m/s, m ↔ ft, °C ↔ °F) persistente em localStorage
- [ ] Sport principal persistente em localStorage + URL

### 5.2 — Estados & Edge Cases
- [ ] Empty state favoritos (ilustração + CTA)
- [ ] Empty state filtros sem matches (mensagem contextual + sugestão alternativa)
- [ ] Offline state (PWA) — "Sem ligação. Dados em cache de HH:MM"
- [ ] Demo/mock state — banner amarelo visível

### 5.3 — Motion & Acessibilidade Final
- [ ] Microinteractions: stagger fade-up cards, lift on hover, underline slide tabs
- [ ] `@media (prefers-reduced-motion: reduce) { animation: none }` global
- [ ] Audit final de contraste, focus rings, heading hierarchy

### 5.4 — Infra & SEO
- [ ] JSON-LD structured data para spots (Schema.org)
- [ ] Sitemap dinâmico com todas as combinações
- [ ] Analytics privacy-first (Plausible/Umami)

**Teste de validação:**
- Lighthouse Performance >75, Accessibility >90, SEO >95
- Teste manual de todas as interações
- Teste em 3 breakpoints (mobile, tablet, desktop)

---

## 🟣 FASE 6: Dados & Features Avançadas (Backlog)

**Fonte:** BACKLOG.md + Fase 5 dos audits  
**Não prioritário mas de alto valor quando chegar aqui:**

### 6.1 — Dados em Falta
- [ ] Marés (Instituto Hidrográfico) — parse + UI no spot detail
- [ ] Qualidade da água (APA) — boletim semanal
- [ ] Imagens reais por spot (Wikimedia Commons/Unsplash)

### 6.2 — Comunidade
- [ ] Chat security completo (rate limit server-side, CAPTCHA, autenticação mínima)
- [ ] Contribuições com RLS apertado (só INSERT anónimo, não UPDATE/DELETE)

### 6.3 — Calibração
- [ ] Recalibração empírica de `sportScore.ts` baseada em feedback real de utilizadores
- [ ] SwellDetective — ativar quando houver pipeline de histórico real

### 6.4 — Internacionalização
- [ ] ES, FR, DE — tradução das ~200 strings
- [ ] URLs por idioma (`/es/`, `/fr/`, `/de/`)

### 6.5 — Infra Avançada
- [ ] Service Worker + PWA completo (offline support)
- [ ] Migrar para ISR/Vercel Edge (se necessário)
- [ ] SEO landing pages por combinação (`/pt/surf/`, `/pt/kitesurf-algarve/`)

---

## 📊 Resumo por Severidade (o que falta resolver)

| Origem | Crítico | Alto | Médio | Baixo | Total |
|--------|---------|------|-------|-------|-------|
| Segurança | 3 | 5 | 6 | 3 | 17 |
| Performance/APIs | 3 | 4 | 7 | 4 | 18 |
| UX Defeitos | 0 | 2 | 12 | 8 | 22 |
| UX Redesign | 0 | 0 | 8 | 12 | 20 |
| Infra/Polish | 0 | 1 | 4 | 3 | 8 |
| **TOTAL** | **6** | **12** | **37** | **30** | **85** |

> Nota: ~27 dos ~112 problemas originais já foram resolvidos nas Fases 1-4 anteriores (knots, coordenadas, SpotGrid redesign, etc.)

---

## 🧪 Como Testar Cada Fase

### Template de teste por fase:

```bash
# 1. Build
npm run build

# 2. Verificar erros no console
# (abrir dist/index.html em browser, verificar DevTools console)

# 3. Verificar funcionalidade crítica
# - Homepage carrega
# - Spot detail carrega
# - Filtros funcionam
# - Chat funciona (se aplicável)

# 4. Lighthouse (se possível)
npx lighthouse https://ventu.surf/pt/ --output=json

# 5. grep de segurança (Fase 1)
grep -r "sb_publishable_ihub\|Ventu2026\|hardcoded" src/
```

---

## 📅 Estimativa de Tempo Total

| Fase | Sessões Est. | Semanas |
|------|-----------|---------|
| Fase 1 — Segurança | 1-2 | 0.5 |
| Fase 2 — Estabilidade | 2-3 | 1 |
| Fase 3 — UX Defeitos | 3-4 | 1.5 |
| Fase 4 — UX Redesign | 3-4 | 1.5 |
| Fase 5 — Polish | 2-3 | 1 |
| Fase 6 — Avançado | 4-6 | 2+ |
| **Total** | **15-22** | **7-10 semanas** |

---

*Plano gerado a partir de 6 relatórios de auditoria independentes.  
Atualizar este ficheiro à medida que fases forem completadas.*
