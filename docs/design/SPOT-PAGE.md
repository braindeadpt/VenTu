# Página de spot — contrato

## Princípios
- Uma pergunta por secção. Uma hora escolhida comanda tudo (useSpotTimeline). Um acento: a cor da banda do score da hora escolhida, exposta como variável CSS --verdict no contentor da página (ÉPICO 80–100 #0EA5E9, BOM 60–79 #10B981, FUN 40–59 #F59E0B, FLAT 20–39 #EF4444, FECHADO 0–19 #6B7280; em fundo claro, usar a variante com contraste ≥3:1 — tokens existentes: `--score-epic`/`--score-good`/`--score-fair`/`--score-poor`/`--score-closed` em `src/app/globals.css` (:90–94 dark = sky-500/emerald-500/amber-500/red-400/gray-500; :224–228 `.theme-ocean` claro já escurece para sky-700/emerald-800/amber-800/red-700/gray-500, AA). `--verdict` = `rgb(var(--score-<tier>))` do tier activo — `scoreTierName(score)` em `src/lib/sportScore.ts` mapeia 80/60/40/20).
- Movimento só quando significa algo (dado ou feedback). Sem carrosséis, glassmorphism, gradientes decorativos, sombras pesadas, emoji, embeds de livecam.

## Secções, dono e âncora
| Ordem | Secção | Componente | Sessão dona | Âncora |
|---|---|---|---|---|
| 0 | Faixa de segurança (só com aviso activo) | SpotVerdictSection | S2A | — |
| 1 | Veredicto — "posso ir?" | SpotVerdictSection | S2A | #agora |
| 2 | Barra fixa única (tabs modalidade + score + hora + âncoras) | SpotVerdictSection | S2A | — |
| 3 | Quando ir — régua de 48 h | SpotVerdictSection | S2A | #quando |
| 4 | Instrumentos Vento / Onda / Maré + detalhe | SpotInstrumentsSection | S2B | #instrumentos |
| 5 | Previsão hora a hora sincronizada | SpotForecastSection | S3 | #previsao |
| 6 | No local · Chegar e estar · Perto daqui | SpotContextSection | S2C | #no-local #chegar #perto |
| 7 | Como sabemos (fontes, confiança, coerência, feedback) | SpotContextSection | S2C | #como-sabemos |

## Conteúdo de cada secção
0. SeaStateSafetyBanner + avisos activos do spot (SpotWarningsSection / avisos costeiros IH). Nunca dentro de accordion.
1. Região · coordenadas; nome (Space Grotesk); hora escolhida em hora local + rótulo "agora" ou "previsão"; score grande (Geist Mono, cor --verdict); banda; frase de porquê a partir de score.factors/factorsEn; nível hoje (SpotLevelToday); uma linha de fonte e confiança que liga a #como-sabemos. Acções visíveis: Favorito, Alerta, Direcções. Menu "Mais": Partilhar, Check-in. Sem foto no topo.
2. Uma só barra fixa: tabs de modalidade com mini-score (mesmo teclado do tablist actual), score e hora escolhida, âncoras Agora · Previsão · No local · Chegar. Cota de pinagem --ventu-spot-sticky-top.
3. Régua de 48 h: barras por hora (neutras; a escolhida em --verdict), tracejado no 60, noite sombreada (nascer/pôr: a página não tem hoje nascer/pôr real — `forecasts.json` baked não traz `is_day`/astro e a Open-Meteo só expõe `is_day` no `current`, não nas horas (`src/lib/openmeteo.ts`, `public/data/forecasts/*.json`). Fonte disponível: `getDaypart`/`BOUNDS` de `src/lib/timeOfDay.ts` — fixo Europe/Lisbon (noite 21:00–05:00, dawn 5–8, day 8–18, sunset 18–21). Usar como aproximação; nascer/pôr real por lat/lon fica como melhoria registada em Dúvidas para S3.), janelas de spotWindows marcadas com parêntese fino e etiqueta curta ("melhor: qui 06–12h"). Arrastar, clicar, setas, Home/End, PageUp/PageDown (±6 h). role="slider" com aria-valuetext ("qui 17 set, 12:00: score 93, ÉPICO"). Botão "Agora". Reproduzir 48 h opcional. Substitui WhenToGoCard, SessionStrip, SpotVerdict.
4. Três cartões iguais com marcas de corte nos cantos:
   - Vento: rosa com sector ideal (bestWind), meia-lua de terra tracejada a partir de coastOrientation, feixe = direcção de onde vem o vento, oscilação ∝ rajada/vento; kt, rajada, offshore/onshore/lateral.
   - Onda: mesma rosa, janela de ondulação (bestSwell), cone = direcção, anéis ao ritmo do período, cone tracejado fora da janela; altura, período, direcção.
   - Maré: curva de 48 h com PM/BM, ponto na hora escolhida, "a encher/a vazar", próxima PM/BM.
   - Foco (hover, clique, teclado) = troca de material: escuro ↔ areia #FAFAF7, sem sombra, scale ≤1.012.
   - Painel de detalhe único por baixo dos três: Vento → ObservedNow, WindRelation, WindFlowGlyph, fonte do vento. Onda → SwellTrainsTable, ObservedWaveCard, BuoySkillLine, BuoyLayerNotice, IsobathsStrip, WaveCalibrationTag. Maré → TideScheduleStrip, MoonTideCard, temperatura da água.
   - Avisos de coerência: marca no cartão afectado + texto completo em #como-sabemos.
5. ForecastMeteogram + ForecastTable com a hora escolhida destacada; clicar numa coluna muda o índice; ao mudar por outra via, scroll da tabela até à coluna (só se a tabela estiver visível). Windguru e "mostrar mais horas" mantêm-se.
6. Desktop 3 colunas, mobile empilhado (No local aberto, restantes em accordion):
   - No local: avisos (ou "Sem avisos activos · fonte, hh:mm"), livecam como link de saída (src/lib/spotLivecams.ts), estação (SpotWeatherlinkSection), qualidade da água (WaterQualityBadge), eventos só se existirem.
   - Chegar e estar: SpotLogisticsPanel, nível, facilidades, perigos (hazards) em lista, LocalTipsSection, SpotImage pequena.
   - Perto daqui: SpotNearbyDirectory com distância e score da MESMA modalidade à MESMA hora escolhida ("—" se não se pratica).
7. Como sabemos: ProvenanceRow, DataSourceBadge, ScoreWindSourceBadge, ScoreWaveSourceBadge, WindSourceAttributionNote, ObservedWaveSourcesChip, ConfidenceBadge (confiança diária), CoherenceWarningNotice/CoherenceRefusedNotice, ScoreFeedback, FeedbackForm.

## Tabela de destino (nenhum componente desaparece sem destino)
Verificado com grep em 2026-09-16 contra `SpotDetailClient.tsx`, `SpotDetailHero.tsx` e `SpotConditionsDashboard.tsx`.

Renderizados por **SpotDetailClient**:

| Componente JSX | Secção de destino |
|---|---|
| `SeoHead` | — (head/meta, sem secção visual) |
| `SpotDetailHero` | 1 · Veredicto |
| `SpotStickyBar` | 2 · Barra fixa |
| linha standalone de tabs (`<section>` + `SportTab` ×n) | 2 · Barra fixa |
| `WhenToGoCard` (com `SessionStrip` + `SpotVerdict` internos) | 3 · Quando ir |
| `SpotConditionsDashboard` | 4 · Instrumentos |
| secção previsão (`h2` + link Windguru + `ForecastMeteogram` + `ForecastTable` + `Button` expandir) | 5 · Previsão |
| `CollapsibleSection` avisos → `SpotWarningsSection` | 0 (faixa activa) / 6 · No local (estado «sem avisos») |
| `CollapsibleSection` livecam → `SpotWebcamSection` | 6 · No local (link de saída) |
| `CollapsibleSection` estação → `SpotWeatherlinkSection` | 6 · No local |
| `SpotUpcomingEvents` | 6 · No local (só se existirem) |
| `CollapsibleSection` logística → `SpotLogisticsPanel` | 6 · Chegar e estar |
| `LocalTipsSection` | 6 · Chegar e estar |
| `SpotNearbyDirectory` | 6 · Perto daqui |
| `FeedbackForm` | 7 · Como sabemos |
| `Skeleton` / `ErrorState` / `Link` voltar / ícones Lucide | — (estados de loading/erro da página) |

Renderizados por **SpotDetailHero**:

| Componente JSX | Secção de destino |
|---|---|
| `SpotImage` (fundo do hero) | 6 · Chegar e estar (versão pequena — §1 é «sem foto no topo») |
| `ScoreGauge` | 1 · Veredicto |
| `SeaStateSafetyBanner` | 0 · Faixa de segurança |
| `WaterQualityBadge` | 6 · No local |
| `SpotLevelToday` | 1 · Veredicto («nível hoje») |
| `StatChip` ×4 (onda, vento, período, temperatura) | 1 · Veredicto (métricas-resumo; S2A decide se ficam no veredicto ou migram para §4) |
| `WindFlowGlyph` | 4 · detalhe Vento |
| `ProvenanceRow` | 7 · Como sabemos |
| `DataSourceBadge` | 7 · Como sabemos |
| `ConfidenceBadge` | 7 · Como sabemos |
| `ScoreWaveSourceBadge` | 7 · Como sabemos |
| `ScoreWindSourceBadge` | 7 · Como sabemos |
| `WaveCalibrationTag` | 4 · detalhe Onda |
| `WindSourceAttributionNote` | 7 · Como sabemos |
| `ObservedWaveSourcesChip` | 7 · Como sabemos |
| `FavoriteButton` | 1 · Veredicto (acção) |
| `SpotAlertPopover` | 1 · Veredicto (acção Alerta) |
| `SocialShare` | 1 · Veredicto (menu «Mais») |
| `CheckInButton` | 1 · Veredicto (menu «Mais») |
| link «Direcções» (`Navigation` icon) | 1 · Veredicto (acção) |
| link voltar (`ArrowLeft`) + chip livecam (`Video` icon, âncora `#spot-livecam`) | 1 · Veredicto (navegação/atalho) |
| ícones Lucide internos (`MapPin`, `Waves`, `Droplets`, `Clock`) | — (decorativos dentro dos componentes) |

Renderizados por **SpotConditionsDashboard**:

| Componente JSX | Secção de destino |
|---|---|
| `ObservedNow` | 4 · detalhe Vento |
| bloco relação vento↔costa (`getWindRelationToCoast` + hints) | 4 · detalhe Vento |
| `SwellRadar` | 4 · Onda (rosa do instrumento) |
| `SwellTrainsTable` | 4 · detalhe Onda |
| `ObservedWaveCard` | 4 · detalhe Onda |
| `BuoySkillLine` | 4 · detalhe Onda |
| `BuoyLayerNotice` | 4 · detalhe Onda |
| `IsobathsStrip` | 4 · detalhe Onda |
| `TideScheduleStrip` | 4 · detalhe Maré |
| `MoonTideCard` | 4 · detalhe Maré |
| `ScoreFeedback` | 7 · Como sabemos |
| `CoherenceWarningNotice` (local ao dashboard) | 7 · Como sabemos (marca no cartão afectado) |
| `CoherenceRefusedNotice` (local ao dashboard) | 7 · Como sabemos |
| ícones Lucide internos (`AlertTriangle`, `HelpCircle`, `Wind`) | — (decorativos) |

Nenhum componente ficou «SEM DESTINO».

## Regras de propriedade de ficheiros (sessões paralelas)
- S2A só altera SpotVerdictSection.tsx, ficheiros novos em src/components/spots/verdict/, translations/spotPage/verdict.ts e specs E2E novos com prefixo spot-v2-verdict.
- S2B só altera SpotInstrumentsSection.tsx, ficheiros novos em src/components/spots/instruments/, translations/spotPage/instruments.ts, funções puras novas em src/lib/instruments/ e specs spot-v2-instruments.
- S2C só altera SpotContextSection.tsx, ficheiros novos em src/components/spots/context/, translations/spotPage/context.ts e specs spot-v2-context.
- Ninguém em S2 apaga componentes antigos nem altera SpotDetailClient.tsx. Se uma sessão precisar de um dado novo nas props da sua secção, regista em "Dúvidas"; a S3 liga-o.
