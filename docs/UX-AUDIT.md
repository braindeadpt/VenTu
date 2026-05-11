# VenTu — UX/UI Audit

Auditoria completa do UX/UI do site em produção (https://braindeadpt.github.io/windspot-pt/pt/) e dos componentes em `src/`. Identifica defeitos actuais, define princípios de design para um forecast tool moderno, e propõe um redesign concreto por componente.

> Pré-requisito: lê `docs/CONTEXT.md` antes deste ficheiro. Define stack, restrições e bugs conhecidos que limitam o que é viável.

---

## Parte 1 — Defeitos actuais

### A. Identidade e first impression

**A1. O hero não comunica para que serve o site.**
Utilizador chega à home, lê "VenTu" gigante, vê um score 87/100 num spot aleatório, três métricas (m/kt/°C). Não sabe se isto é para surfistas, kiters, planeadores de viagem ou turistas. Comparação: Windguru tem campo de busca + lista de spots populares acima de tudo; Surfline mostra livecam. VenTu mostra um número descontextualizado.

**A2. "Melhor Spot Hoje" é só best-surf-score.**
A lógica é `sort by allScores['surf']` — independentemente do desporto do utilizador. Para um kiter que vem ao site, "melhor spot: Supertubos 87/100" quando ele queria Guincho é desorientador. Ranking precisa de ser **agnóstico ao desporto** ou **personalizado**.

**A3. Tipografia sem hierarquia real.**
"VenTu" (h1) e nomes de spot (h1 também) usam font-weight 900 com tamanhos próximos. Score badge `text-3xl` vs nome `text-5xl` vs subtítulos `text-xl`. Cinco níveis tipográficos misturados. Inter declarada em `globals.css` mas **não carregada** (sem `next/font`, sem `<link>` Google Fonts) — site usa system fonts a fingir Inter.

**A4. Paleta confusa.**
`tailwind.config.ts` define 4 famílias (`ocean`, `surf`, `wind`, `wave`) mas a homepage usa defaults (`cyan`, `sky`, `emerald`, `slate`). Coexistem dois sistemas. `text-gradient` do logo é cyan→green→amber (paleta "tropical resort") contra resto dark/ocean — choque visual. Para meteo náutica, cromática devia **mapear-se a significado** (cyan=água, amber=vento, emerald=bom, rose=mau), não ser decorativa.

### B. Densidade de informação e hierarquia

**B1. SpotCard com 6+ pontos de informação, peso visual igual.**
Cada card: nome, região, score, ondas, vento, água, rating textual, factors text, primaryFactor text. Paragraph dentro de cartão. O olho não tem para onde ir.

**B2. Falta de glanceability.**
"Consigo perceber em 0,5s se vale a pena ir surfar hoje?" Hoje precisa de 5 saltos cognitivos:
1. "Best Spot Today" → onde fica? que desporto?
2. Nome → é perto de mim?
3. 87/100 → bom para quê?
4. "Excelentes condições" → a que horas?
5. factors → "2.1m • 8s • Offshore"

Devia ser um salto. Surfline faz com **um star rating + wave shape + ETA da próxima janela**.

**B3. SpotCard duplicado.**
Componente `src/components/spots/SpotCard.tsx` mostra factors text, primaryFactor, image gradient placeholder. O componente inline em `src/app/[locale]/page.tsx` (também chamado `SpotCard`) tem outra estrutura. Dois cards, dois estilos, ambos usados.

**B4. WindCompass bug visual.**
`<svg style={{ transform: rotate(${direction}deg) }}>` aplica rotação a TUDO incluindo labels "N S E W". Vento de sul → "N" aparece em baixo. Compasses meteo rodam só a seta, não o círculo. Ficheiro: `src/components/ui/WindCompass.tsx`.

**B5. Facilities sem ícones nem ordem.**
"Estacionamento • Escolas surf • Restaurantes • Metro • WC" — chips de texto sem afordância visual. Devia ter ícones (parking P, escola, restaurante, metro, WC). `FIXES.md` menciona "Instalações com iconografia Lucide" mas no `SpotDetailClient` só vejo chips de texto.

### C. Visualização de dados

**C1. ForecastChart é Recharts genérico com duas linhas sobrepostas.**
Ondas (m) e Vento (kt) no mesmo eixo Y com escalas diferentes (ondas ~1-3, vento ~5-30), uma esmaga a outra. Sem indicador "hora actual", sem marcação "melhor janela", sem cor por severidade. Stormglass/Surfline usam **bandas horizontais coloridas** ou **wave shape diagrams**. Ficheiro: `src/components/weather/ForecastChart.tsx`.

**C2. ForecastMini do SpotDetail: 8 cards iguais com um número.**
"10h | 1.2m" × 8 não diferencia visualmente. Devia ter:
- Cor de fundo por score
- Mini-ícone de tendência (↑ subir, → estável, ↓ descer)
- Hora actual destacada

**C3. LiveTicker não comunica utilidade.**
Marquee no topo com 5 spots em loop. Para alguém em Porto, "Nazaré 1.2m" a passar a 30 km/h não é informação útil — é decoração. Funciona melhor como **"top 3 perto de ti"**. Hover-to-pause não é descobrível em mobile.

**C4. MiniMap é iframe escurecido a `opacity-70`.**
OpenStreetMap a 70% opacidade, sem markers, com gradient overlay. Visualmente "tenho mapa porque é suposto". Não é interactivo, não mostra spots, não tem cor por condições. Mapa sem markers num site sobre spots é peculiar. Ficheiros: `src/app/[locale]/page.tsx` (MiniMap inline) e `src/components/spots/SpotMap.tsx` (por spot).

### D. Interacção

**D1. Filtros que partem silenciosamente.**
Norte/Centro/Lisboa não filtram nada (region é municipal). Utilizador vê "Nenhum spot encontrado" e desiste. Nem sequer há "Clear filters" para recuperar.

**D2. Filtros sem sincronização com URL.**
Mudar desporto não muda URL, não é shareable, não persiste em refresh. Para um site community-driven, falha. Cada combinação devia ser rota.

**D3. Favoritos só em `localStorage`.**
Útil para começar mas: limpas browser, perdes tudo. Mudas telefone, idem. Não shareable. Pelo menos uma URL `?favs=guincho,nazare,supertubos` que pudesse ser bookmarked.

**D4. Chat por spot escondido no fundo do SpotDetail.**
Ordem actual: hero > score > selector > stats > forecast > map > info > **chat**. Em mobile, 5+ scrolls. E é o feature mais original do produto (vs Windguru que não tem comunidade).

**D5. SportSelector com 6 desportos sempre visíveis.**
Castelo de Bode não tem ondas mas "Surf" aparece como opção (disabled). Mostrar só desportos relevantes do spot reduz ruído.

**D6. Sem dark/light mode toggle.**
Hardcoded dark. Em mid-day na praia, com telefone ao sol, `text-white/30` sobre `slate-950` fica imperceptível. WCAG é UX prático para o use case.

### E. Mobile UX

**E1. Hero 70vh come o ecrã todo.**
iPhone: 70vh + header come o viewport inteiro. CTA "Ver Condições ao Vivo" + "Explorar todos os spots" — dois botões grandes, um chega.

**E2. Filter bar horizontal com overflow-x silencioso.**
14 pills em horizontal scroll. Sem fade-edge nem chevron a indicar que há mais. Utilizador não percebe que pode arrastar.

**E3. Ticker em mobile difícil de ler.**
Texto pequeno a passar a velocidade fixa. Em 320px largura, lê-se metade da informação por spot antes de sair.

**E4. Mapa por spot 56h × 192px.**
OpenStreetMap embed nesse tamanho não permite leitura geográfica. Devia ser 256-320px ou mapa estático com marker visível.

### F. Loading & states

**F1. "A carregar condições..." em ecrã inteiro.**
Spinner cyan + texto. Sem skeleton, sem progressive disclosure. Durante 1-3s (81 fetches) ecrã vazio. Devia mostrar layout esqueleto com shimmer.

**F2. Sem indicação de freshness.**
"Atualizado às 14:23" não existe na UI. Em meteo, stale data assusta — minutos fazem diferença. Mostrar `updatedAt` em cada spot ou header global.

**F3. Sem error states distintos.**
Se fetch falhar, mock data é injectado silenciosamente. Utilizador acredita que 2,1m de Nazaré são reais. Devia haver "⚠ dados em cache" / "⚠ dados estimados".

### G. Microcopy

**G1. Inconsistência de tom.**
"Spots", "VS", "Favs", "Modo demo", "Crowd moderado", "Ondas estão a bater!", "Sê o primeiro!". Mistura inglês técnico ("VS"), abreviações ("Favs"), surfês ("crowd", "bater"). Sem voice guide.

**G2. PT-PT vs PT-BR.**
"Tu" é PT-PT, "A carregar" é PT-PT. Confirmar e marcar `<html lang="pt-PT">` em vez de só `pt`.

**G3. Emojis vs ícones — inconsistente.**
"⚠️ Vento muito forte" no SpotDetailClient mas `<Shield>` Lucide no chat warning. Decidir um sistema.

### H. Acessibilidade visual

**H1. Contraste insuficiente.**
- `text-white/40` sobre `bg-slate-950` → ratio ~2,8 (precisa ≥4,5 AA)
- `text-white/30` em sub-text → ratio ~2,1, falha AA grande
- Score colorido sobre `bg-{score}-500/20` — limítrofe

**H2. Focus states quase invisíveis.**
Default browser ring em alguns; o resto sem `focus-visible:`. Navegação por teclado dolorosa.

**H3. Animações sem `prefers-reduced-motion`.**
Hero pulsing, marquee infinito, bounce chevron. Para vestibular sensitivity ou epilepsia fotosensível, problema.

---

## Parte 2 — Princípios para um forecast tool moderno (2026)

Estado da arte: Windguru, Surfline, Magicseaweed, Stormglass, Surf-forecast, Windfinder.

**P1. Densidade > beleza.** Windguru lidera há 20 anos porque mete 84h × 12 variáveis = ~1000 pontos de dados num ecrã legível. Cards bonitos com 3 stats em prosa servem turistas, não a tribo. VenTu tem menos info mas parece ter mais por layout prolixo.

**P2. Cor é semântica.** Cada célula em Windguru tem cor que indica go/marginal/no-go. Não decoração. VenTu usa cores ocean/cyan/emerald por estética.

**P3. Camera + condições + horário num só lugar.** Surfline integra livecam + report + forecast com timeline scrubbable. Vários spots PT têm livecams públicas (Carcavelos, Costa Caparica, Guincho, Supertubos, Ribeira d'Ilhas, Praia do Norte Nazaré) — embed.

**P4. Mobile-first dense.** Windfinder Pro e Surfline app são tão densas em mobile como em desktop. Não simplificam — adaptam o layout. Tabela horizontal-scroll com horas e células coloridas.

**P5. Personalização persistente.** Spots favoritos, desporto principal, nível, unidades (kt vs km/h vs m/s), região "home". Tudo em localStorage ou URL. Próxima visita 10× mais rápida.

**P6. Janelas, não instantes.** "Melhor janela hoje: 09:00–11:30, score 78" em vez de "agora 1,2m / 18kt". Surfistas planeiam por janela.

**P7. Comparação cross-spot.** "Dos 5 spots a 1h de Porto, qual amanhã às 9h?" — esta query decide ir ou não ir. VenTu tem `/compare` mas escondido.

**P8. Confiança = mostrar fontes.** Surfline mostra modelo (NWW3, ECMWF); Windguru mostra GFS/IFS/Wavewatch lado-a-lado. Power-users querem comparar previsões.

**P9. WOW de 2026 ≠ animation-heavy.** Vem de:
- Visualização inteligente (wave shape diagrams, wind barbs, swell arrows sobre mapa)
- Velocidade (sub-second navigation)
- Mapa interactivo com markers coloridos por score
- Tema de espessura (paddings generosos, tipografia confiante, microinteractions)
- Densidade controlada (tabela 12 colunas que se lê bem)

---

## Parte 3 — Proposta de redesign

### Foundation (sistema de design)

**Tipografia**
- Carregar via `next/font/google`:
  - Display: **Geist** ou **Inter Tight** (tabular-nums via feature settings)
  - Body: **Geist** ou **Inter**
- Scale Tailwind:
  - `display-xl` 56/64 — hero score + nome spot na hero
  - `display-lg` 40/48 — h1 spot detail
  - `h2` 24/32 — section headers
  - `h3` 18/24 — card names
  - `body` 14/20 — descriptions
  - `meta` 12/16 — labels, units
  - `mono` (tabular-nums) — TODOS os números

**Paleta semântica única** (eliminar `ocean/surf/wind/wave` se não usadas com significado)

```
Background: zinc-950 (mais neutro que slate)
Surface 1: white/4 com border white/8
Surface 2 (hover): white/8 com border white/12

Score colors (semantic):
  Epic    80-100: emerald-400 + glow
  Good    60-79:  sky-400 + glow
  Fair    40-59:  amber-400
  Poor    20-39:  orange-500
  Closed  0-19:   rose-500

Variable colors (data viz):
  Waves:   blue-400
  Wind:    amber-400
  Water:   teal-400
  Period:  violet-400

Off-shore wind tint: green
On-shore wind tint: red
```

**Spacing/radius/depth**
- Radius: 8 / 12 / 16 (cards) / 24 (hero) — uma só por categoria
- Shadow: apenas `shadow-glow-<color>` e `shadow-card` (subtle)
- Glassmorphism só quando há background atrás. Cards sólidos sobre cor sólida.

### Layout proposto — Homepage

```
┌─────────────────────────────────────────────────┐
│ HEADER (slim, 56px)                             │
│ Logo • Spots • Favs • News • Sobre • PT/EN     │
├─────────────────────────────────────────────────┤
│ STATUS BAR (32px, sticky, opcional)             │
│ ● Atualizado às 14:23 | 81 spots monitorados    │
├─────────────────────────────────────────────────┤
│                                                 │
│ HERO (50vh desktop, 40vh mobile)                │
│ ───────────────────────────────────             │
│ Background: gradient ocean + parallax sutil     │
│                                                 │
│ Pre-title: "Domingo, 11 de Maio • Porto"        │
│ Title:    "5 spots ON perto de ti hoje"         │
│ Sub:      "Top score: Supertubos 87/100"        │
│                                                 │
│ [Procurar spot...]  (search com autocomplete)   │
│ [Surf] [Kite] [Wind] (sport switcher inline)    │
│                                                 │
├─────────────────────────────────────────────────┤
│ TOP 3 PARA TI (3 cards grandes, glanceable)     │
│ ───────────────────────────────────             │
│ Personalização por geolocation + sport          │
│ Cada card = nome | wave shape SVG | score gauge │
│            | melhor janela | distância          │
│                                                 │
├─────────────────────────────────────────────────┤
│ MAPA INTERACTIVO (60vh)                         │
│ ───────────────────────────────────             │
│ Portugal + Açores + Madeira com markers         │
│ cor = score do desporto seleccionado            │
│ hover = preview card popup                      │
│ click = navega ao spot                          │
│                                                 │
├─────────────────────────────────────────────────┤
│ TABELA COMPLETA (estilo Windguru, opcional)     │
│ ───────────────────────────────────             │
│ Todos os spots × 24h, células coloridas         │
│ Filtros sticky em cima                          │
│                                                 │
├─────────────────────────────────────────────────┤
│ FOOTER                                          │
└─────────────────────────────────────────────────┘
```

### Componentes signature a criar

**ScoreGauge** (`src/components/ui/ScoreGauge.tsx`)
Substitui o "87/100" textual. SVG circular:
- Arco 270° (deixa 90° em baixo para label)
- Cor do arco = score color
- Glow externo proporcional ao score
- Número grande no centro (tabular-nums)
- Label pequena em baixo ("Surf", "Kite")
- Animação count-up 0→score em 600ms na primeira viewport entry

**WaveShape** (`src/components/ui/WaveShape.tsx`) — *signature visual do produto*
SVG mostra a **forma da onda** em vez de número. Inputs: `height`, `period`. Output: curva senoidal com:
- Amplitude ∝ height
- Período ∝ period
- Cor blue→teal por height
- Background com linha de horizonte
- Overlay "2,1m @ 8s"
- Hover: crest direction

Os surfistas leem forma da onda melhor que números. Componente distintivo e screenshotável.

**SwellRadar** (`src/components/ui/SwellRadar.tsx`) — *hero candidate*
SVG circular com:
- Spot no centro
- Seta grande do swell com magnitude
- Seta menor do wind
- Linha da costa (orientação) sobreposta
- Visualização instantânea de "está offshore?" sem ler texto

**WindCompass redesign** (`src/components/ui/WindCompass.tsx`)
- Rodar SÓ a seta, NÃO os labels (fix do bug actual)
- Segundo arco indicando rajada (linha externa)
- Cor da seta = força (green<10kt → amber<20 → red>25)
- Hover/click: pop-out explica offshore/onshore por spot
- Label "NW" em vez de "N" + rotation (mais legível)

**ForecastTable** (`src/components/weather/ForecastTable.tsx`) — *signature feature*
Estilo Windguru moderno:
```
        |  6h  8h  10h 12h 14h 16h 18h 20h
─────────┼─────────────────────────────────
Ondas   |  1.8 2.1 2.3 2.2 2.0 1.9 1.7 1.5
Período |   8   8   9   9   8   8   7   7
Vento   |  12  14  16  18  20  22  20  18
Rajada  |  16  18  22  25  28  30  28  24
Direcção|  ↗   ↗   →   →   ↘   ↘   ↘   ↓
Água    | 16.2
Score   |  72  78  85  87  82  76  68  60
```
- Células com background-color por valor (red→green gradient sutil)
- Coluna actual destacada com border vertical
- Setas Unicode/Lucide rotacionada para direcção
- Linha "Score" como resumo final
- Tooltip on hover com detalhe
- Mobile: scroll horizontal, primeira coluna sticky

**LiveCam** (`src/components/spots/LiveCam.tsx`)
Para spots com cam pública:
- Embed iframe ou snapshot refresh-every-30s
- Overlay com hora actual + condições
- Single biggest WOW sem custo de desenvolvimento (são embeds)
- Spots com livecam conhecida: Carcavelos, Costa Caparica, Guincho, Supertubos, Praia do Norte de Nazaré, Ribeira d'Ilhas

### SpotCard redesign

```
┌──────────────────────────────────┐
│ Supertubos              [⭐ Fav]│
│ Peniche · 1h15min de ti          │
│                                  │
│  ╭─────╮  ╭──────────────╮      │
│  │ 87  │  │  wave shape   │      │
│  │ /   │  │   ~~~~~       │      │
│  │ 100 │  │               │      │
│  ╰─────╯  ╰──────────────╯      │
│                                  │
│  2.1m   8s    18kt NW   16°C    │
│  ondas  per   vento ↗   água    │
│                                  │
│  ⏱ Melhor janela: 09:00–11:30    │
│  📍 [ver spot →]                │
└──────────────────────────────────┘
```
- Sem image placeholder (maioria dos spots sem foto real)
- ScoreGauge esquerda + WaveShape direita = identity instantânea
- 4 stats em row com units abaixo, mono font para números
- Drive time calculado da localização do utilizador (não hardcoded de Lisboa)
- "Melhor janela" calculada do forecast, não só "agora"

### SpotDetail redesign

```
┌─────────────────────────────────────────────────┐
│ ← Todos os spots          [⭐ Fav] [↗ Share]    │
│                                                 │
│ SUPERTUBOS                                      │
│ Peniche · Intermédio · ≈ 1h15 de ti            │
├─────────────────────────────────────────────────┤
│ [SURF 87] [Kite 32] [Wind 28] [Body] [SUP]      │
│  ↑ tabs com score badge em cada                 │
├─────────────────────────────────────────────────┤
│  ┌─────────┐    ┌──────────────────────┐        │
│  │   87    │    │  Wave Shape          │        │
│  │  /100   │    │  ~~~~~~              │        │
│  │  ÉPICO  │    │  2.1m @ 8s NW        │        │
│  └─────────┘    └──────────────────────┘        │
│                                                 │
│  Melhor janela: 09:00 – 11:30                   │
│  3/2 mm wetsuit · crowd moderado · maré a subir │
├─────────────────────────────────────────────────┤
│ LIVE CAM (se disponível)                        │
│  [Imagem ao vivo, refresh 30s]                  │
├─────────────────────────────────────────────────┤
│ 7-DAY FORECAST TABLE                            │
│  [Tabela densa com cores]                       │
├─────────────────────────────────────────────────┤
│ HOJE EM DETALHE                                 │
│  Wave shape + wind compass + swell radar        │
│  numa row de 3 widgets visuais                  │
├─────────────────────────────────────────────────┤
│ MAPA + CONTEXTO GEOGRÁFICO                      │
│  Mapa maior (320px) com marker, orientação      │
│  da costa, swell incidence overlay              │
├─────────────────────────────────────────────────┤
│ SOBRE O SPOT                                    │
│  Descrição                                       │
│  Tabs: [Facilities] [Hazards] [Local Tips]      │
├─────────────────────────────────────────────────┤
│ CHAT DA COMUNIDADE                              │
│  ↑ promover para acima das tips                 │
│  Mostrar 3 últimas mensagens + "ver chat"       │
└─────────────────────────────────────────────────┘
```

### Interacções a adicionar

**Search com autocomplete (hero)**
- Input no hero. Type "naz" → dropdown com Nazaré, Praia do Norte, Praia da Vitória
- Cmd+K shortcut visível
- Recent + favourites no topo do dropdown vazio

**Geolocation opcional**
- Banner: "Permitir localização para spots perto de ti?" (uma vez, dismissable)
- Se sim: ordenar Top 3 + coluna "Distância"/"Drive time"
- Se não: fallback por IP ou pergunta "De onde és?" (radio: Norte/Centro/Sul/Açores/Madeira)

**Sport como state persistente**
- Primeira visita: pergunta "Desporto principal?" → localStorage
- Navegação respeita
- Switcher sempre visível no header (não no hero)

**URL como source of truth**
- `/pt/?sport=kitesurf&region=cascais&difficulty=intermediate`
- Shareable links que aterram com estado certo

**Unit toggle** (settings)
- kt ↔ km/h ↔ m/s
- m ↔ ft
- °C ↔ °F
- Persiste em localStorage

### Motion / micro-interactions

| Trigger | Resposta | Duração |
|---|---|---|
| Page load | Stagger fade-up cards (50ms entre cada) | 400ms |
| Score gauge entry | Count-up 0→N + arc fill | 600ms easeOut |
| Wave shape entry | Curva desenha-se (stroke-dasharray) | 800ms |
| Filter change | Cards crossfade + reflow | 300ms |
| Hover card | Lift -2px + glow + saturate | 200ms |
| Tab change | Underline slide + crossfade | 200ms |
| Loading | Shimmer skeleton (não spinner) | infinite |

Todos com `@media (prefers-reduced-motion: reduce) { animation: none }`.

### Estados ausentes a adicionar

- **Empty state** favoritos: ilustração SVG de onda + CTA
- **Empty state** filtros sem matches: "Nenhum spot com Kite no Algarve hoje. Tenta Surf, ou abre Cascais."
- **Stale data badge**: "Dados de há 47 min" em amarelo se >30 min
- **Offline state** (PWA): "Sem ligação. Dados em cache de 14:23"
- **Error state** com retry button
- **Demo/mock state**: banner amarelo

---

## Parte 4 — Plano de implementação por fases

Cada fase é uma sessão separada com a LLM. Não pedir tudo de uma vez.

### Fase 1 — Foundation (1-2 sessões)
**Objectivo:** sistema de design coerente que sirva todo o resto.

Deliverables:
- [ ] Tailwind config refactor: paleta semântica única, eliminar duplicações
- [ ] `next/font` para carregar Geist ou Inter Tight
- [ ] Escala tipográfica em `tailwind.config.ts`
- [ ] `globals.css` limpo: shadows, focus rings, `prefers-reduced-motion`
- [ ] CSS custom properties para score colors (utilizáveis em JS para gauges)

Ficheiros tocados: `tailwind.config.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/[locale]/layout.tsx`.

### Fase 2 — Componentes signature (3-4 sessões)
**Objectivo:** linguagem visual única e screenshotable.

Deliverables (cada um numa sessão separada):
- [ ] `ScoreGauge` em `src/components/ui/ScoreGauge.tsx`
- [ ] `WaveShape` em `src/components/ui/WaveShape.tsx`
- [ ] `SwellRadar` em `src/components/ui/SwellRadar.tsx`
- [ ] `WindCompass` rewrite (fix bug + redesign) em `src/components/ui/WindCompass.tsx`

Cada componente: SVG puro, Tailwind para wrapping, props tipadas, prefers-reduced-motion, storybook-style demo no JSDoc.

### Fase 3 — Componentes compostos (2-3 sessões)
**Objectivo:** novos cards e tabelas usando os signature.

Deliverables:
- [ ] `SpotCard` redesign (eliminar duplicação, novo layout)
- [ ] `ForecastTable` (Windguru-style) em `src/components/weather/ForecastTable.tsx`
- [ ] `LiveCam` em `src/components/spots/LiveCam.tsx`

### Fase 4 — Páginas (3-4 sessões)
**Objectivo:** redesenhar layout das páginas usando os novos componentes.

Deliverables:
- [ ] Homepage redesign (`src/app/[locale]/page.tsx`)
- [ ] SpotDetail redesign (`src/components/spots/SpotDetailClient.tsx`)
- [ ] Spots index (`src/app/[locale]/spots/page.tsx`)
- [ ] Favorites + Compare polish

### Fase 5 — Interacções e estados (2 sessões)
**Objectivo:** elevar de "redesign" a "produto".

Deliverables:
- [ ] Search com autocomplete + Cmd+K
- [ ] Filtros sincronizados com URL
- [ ] Unit toggle (kt/km/h/m/s, m/ft, °C/°F)
- [ ] Estados ausentes (empty/stale/offline/error/demo)
- [ ] Geolocation opcional

### Fase 6 — Polish (1-2 sessões)
- [ ] Motion microinteractions
- [ ] Acessibilidade audit (axe-core, contraste, focus, prefers-reduced-motion)
- [ ] Mobile finetuning

---

## Como pedir cada fase à LLM

Template:

```
Lê docs/CONTEXT.md e docs/UX-AUDIT.md.

Objectivo desta sessão: Fase [N] — [título].

Implementa apenas:
- [item 1]
- [item 2]

Restrições:
- Não tocar em ficheiros fora de: [paths]
- Não adicionar dependências npm.
- Manter compatibilidade com static export.
- Bugs técnicos conhecidos: unidades de vento ✅ RESOLVIDO (commit 1f58255), slugs duplicados ✅ RESOLVIDO (commits anteriores + 8f4785e), findIndex || 0 ✅ RESOLVIDO. Outros (filtro regiões, mockNews, CSP, WindCompass, etc.) continuam pendentes.

Antes de gerar código, faz-me 2-3 perguntas se houver ambiguidade no design.

Output esperado:
- Ficheiros completos novos
- Diff dos ficheiros existentes alterados
- Lista de imports a adicionar
- Notas de teste (como verificar visualmente que funciona)
```
