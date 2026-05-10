# WindSpot — Plano de Diferenciação

## O Problema
A frontpage atual é uma cópia do Beachcam/Surftotal:
- ❌ Webcams que não funcionam
- ❌ Previsões genéricas (Open-Meteo) — o mesmo que todos têm
- ❌ Lista chata de spots com dados técnicos
- ❌ Zero "personalidade" portuguesa
- ❌ Zero informação que um local já não saiba

## A Visão
**WindSpot = o Guia Local que os sites grandes nunca serão.**

Informação que só quem surf/kitesurf em Portugal sabe. Métricas que ninguém calcula. Uma experiência divertida, útil e impossível de ignorar.

---

## 1. Remover Webcams (FASE 1 — Já)
- Apagar o componente WebcamSection
- Apagar campos webcamUrl dos spots
- Commit: "remove broken webcams — open to community contributions"

## 2. Nova Frontpage — "Onde é que está a Boa Onda Hoje?"

### O Que Ninguém Tem:

#### A. Surfability Score (0-100) 🏄‍♂️
Um algoritmo próprio que combina:
- Wave height + period + direction vs. spot orientation
- Wind speed + direction vs. spot "offshore ideal"
- Tide height vs. spot "best tide range"
- Resultado: "Hoje o Guincho tá a 87/100 — FIRE! 🔥"

#### B. Session Quality Forecast ⭐
Para as próximas 48h, por hora:
- "Amanhã 7h: ⭐⭐⭐⭐⭐ (offshore, swell limpo)"
- "Amanhã 14h: ⭐⭐ (onshore, vento sul)"
- Com cores: verde (go!), amarelo (meh), vermelho (evita)

#### C. Crowd Forecast 👥
- Estimativa de lotação baseada em:
  - Dia da semana (fins de semana = mais crowded)
  - Condições (bom swell = todos aparecem)
  - Época do ano (verão = turistas)
- "Hoje à tarde: Crowd Médio (20-30 pessoas na água)"

#### D. Water Quality / Flag Status 🚩
- Dados do IAP/Administração Hidrográfica
- "Bandeira Verde — Água limpa ✅"
- "Bandeira Amarela — Atualização em 2h ⚠️"

#### E. Sunrise/Sunset + Dawn Patrol Score 🌅
- "Amanhã: Dawn Patrol 6:12h — Swell a chegar às 8h"
- "Pôr-do-sol session: 20:45h — Vent offshore até 19h"

### Layout da Frontpage:

```
┌─────────────────────────────────────────┐
│  🌊 WindSpot — Onde está a boa onda?    │
│  "Hoje é dia de Guincho! 🔥"            │
├─────────────────────────────────────────┤
│                                         │
│  [MAPA INTERATIVO DE PORTUGAL]          │
│  - Spots com cores ao vivo              │
│  - Verde: BOM | Amarelo: OK | Cinza:    │
│    Mau                                  │
│                                         │
├─────────────────────────────────────────┤
│  🏆 TOP 3 SPOTS HOJE                    │
│  1. Guincho — 92/100 🔥🔥🔥             │
│  2. Ericeira — 78/100 ⭐                 │
│  3. Peniche — 65/100 👍                  │
├─────────────────────────────────────────┤
│  📊 CONDIÇÕES EM DESTAQUE               │
│  🌊 Swell: 1.2m @ 12s WNW              │
│  💨 Vento: 15km/h NNE (offshore!)       │
│  🌡️ Água: 16°C                          │
│  🌊 Maré: Baixa em 14:30h               │
├─────────────────────────────────────────┤
│  🗣️ O QUE OS LOCALS DIZEM               │
│  "Ribeira tava on fire hoje de manhã!"  │
│  — Zé, Ericeira, há 2h                  │
├─────────────────────────────────────────┤
│  📅 PRÓXIMA GRANDE SWELL                │
│  "Swell de 3m chega Sábado! 💥"         │
└─────────────────────────────────────────┘
```

## 3. Página do Spot — "A Bíblia do Spot"

### O Que Ninguém Tem:

#### A. Local Knowledge Section 📚
- "Como funciona este spot"
- "Melhor maré: média-baixa, subindo"
- "Horas a evitar: 12h-15h (vento onshore)"
- "Acesso: Parque no campo junto à praia, não na rua principal"
- "Onde comer depois: Tasca do Zé, 5min a pé"
- "Dica do local: A onda fecha mais rápido na maré alta"

#### B. Spot Anatomy (Diagrama) 🗺️
```
        [CHANNEL]
             │
    ┌────────┴────────┐
    │   PEAK A (esq)  │ ← Funciona em swell NW
    │   PEAK B (dir)  │ ← Funciona em swell W
    │   RIVER MOUTH   │ ← Corrente, cuidado!
    └─────────────────┘
         [SAND BAR]
```

#### C. Season Calendar 📅
- "Janeiro: Swell grande, frio, vazio"
- "Julho: Flat, turistas, água quente"
- "Outubro: Melhor mês — consistência + offshore"

#### D. Spot Comparison Tool ⚖️
- "Guincho vs. Carcavelos — qual escolher hoje?"
- Compara lado a lado: swell, vento, crowd, distância

#### E. User Reports (Comunidade) 📝
- "Hoje 7h — 3-4ft, limpo, 10 pessoas na água"
- Com fotos, ratings, condições reais
- "Funcionou? Sim/Não" — feedback da comunidade

#### F. Historical Data (Futuro) 📊
- "Este spot funciona em 73% dos dias de Inverno"
- "Média de crowd: 15 pessoas (manhã) vs 45 (tarde)"

## 4. Métricas Únicas — O Algoritmo WindSpot 🤖

### Surfability Score (0-100)
```
score = waveQuality * 0.4 + windQuality * 0.3 + tideQuality * 0.2 + periodBonus * 0.1

waveQuality = min(1, waveHeight / idealWaveHeight) * shapeFactor
windQuality = 1 - (windSpeed / 50) if offshore else 0.3

tideQuality = 1 - abs(currentTide - idealTide) / tideRange
```

### Session Rating (⭐)
- ⭐ = Flat ou onshore forte
- ⭐⭐ = Rideable mas nada especial
- ⭐⭐⭐ = Boa sessão, vale a pena
- ⭐⭐⭐⭐ = Excelente, não percas!
- ⭐⭐⭐⭐⭐ = Épico, chama os amigos!

### Crowd Index (🟢🟡🔴)
- 🟢 Vazio (< 10 pessoas)
- 🟡 Médio (10-30)
- 🔴 Crowded (> 30)
- ⚫ Locals only (sem turistas, só quem conhece)

## 5. Design — "Boa Onda, Divertido, Profissional" 🎨

### Vibe:
- Cores: Azul oceano + Laranja pôr-do-sol + Branco areia
- Tipografia: Bold e moderna (títulos) + Legível (corpo)
- Animações: Ondas suaves, transições fluidas
- Emoji e ícones surf culture: 🌊🏄‍♂️🤙🌅

### Elementos Divertidos:
- "Dawn Patrol Alarm" — Notificação quando o spot está FIRE
- "Stoke Meter" — Medidor de hype para o próximo swell
- "Session Streak" — Contador de dias seguidos que surfaste
- "Spot Unlocked" — Gamification: "Descobriste o spot secreto do Alentejo! 🏆"

### Navegação:
- Mapa interativo como hero (não lista chata)
- Filtros divertidos: "Só spots que funcionam hoje", "Para iniciantes", "Sem crowds"
- Swipe cards nos mobile (Tinder-style para spots 😂)

## 6. Comunidade & Conteúdo Gerado por Utilizadores 👥

### Features:
- **Spot Reports**: "Acabei de sair da água — 4ft, offshore, 15 pessoas"
- **Photos**: Galeria do spot com fotos da comunidade
- **Tips**: Dicas votadas pela comunidade ("Melhor café: Café do Zé")
- **Q&A**: "Alguém sabe se o acesso norte está aberto?"
- **Events**: "Competição WSL na Ericeira — 12-15 Junho"

### Gamification:
- Badges: "First Timer", "Dawn Patrol", "Explorer", "Local Legend"
- Leaderboards: "Quem mais reportou condições esta semana"
- Spot Mastery: "Surfaste 10 spots diferentes em Portugal!"

## 7. Dados Exclusivos (Informação que Não Existe em Lugar Nenhum) 🔍

### O Que Vamos Construir:
1. **Spot-Specific Rules**: "Em Supertubos, a prioridade é de quem vem de trás da onda"
2. **Parking Guide**: "Estacionamento grátis na rua X, evita o parque pago às 10h"
3. **Food & Drink Nearby**: "Depois da sessão: Tasca do Zé — bifana + cerveja 5€"
4. **Accommodation for Surfers**: "Melhor hostel para surfers: Peniche Surfcamp"
5. **Local Services**: "Onde arranjar reparação de pranchas em Ericeira"
6. **Transport**: "De Lisboa até Peniche: 1h15, melhor hora: 6h para dawn patrol"
7. **Secret Spots Database** (com acesso gradual): "Nível 5 desbloqueia spots secretos"

## 8. Roadmap de Implementação 🗓️

### Fase 1 — ✅ CONCLUÍDA (Maio 2026)
- [x] Remover webcams quebradas
- [x] Criar Surfability Score algorithm (0-100)
- [x] Redesenhar frontpage com stats + top spots
- [x] Adicionar Session Quality Forecast
- [x] Adicionar MagicWindows (melhores horas)
- [x] Crowd estimation
- [x] i18n completo PT/EN

### Fase 2 — ✅ CONCLUÍDA (Maio 2026)
- [x] Página do spot com Local Knowledge / Secret Tips
- [x] Spot Comparison Tool
- [x] Community Chat por spot com moderação
- [x] Water Quality / Bandeira Azul 2025
- [x] Design system: cores, tipografia, componentes
- [x] SpotMap OpenStreetMap
- [x] FavoriteButton com localStorage

### Fase 3 — 🔄 EM PROGRESSO
- [ ] Mapa interativo com spots coloridos (Leaflet/SVG)
- [ ] Gamification (badges, streaks)
- [ ] User-generated content (fotos, tips)
- [ ] Push notifications ("O teu spot favorito está a 90/100!")
- [ ] PWA completo (service worker, offline)
- [ ] Testes com Vitest

### Fase 4 — Futuro
- [ ] Mobile app (PWA avançado)
- [ ] Community moderation avançada
- [ ] Premium features (spots secretos, alerts avançados)
- [ ] Integração com GPS / tracking de sessões
- [ ] Rede social completa (posts, likes, perfis, seguir)

---

## Perguntas para o User 🤔

1. **Queres que eu comece pela Fase 1 agora?** (remover cams + score + frontpage nova)
2. **Tens preferência de "vibe" do design?** (mais surf culture, mais tech, mais minimalista?)
3. **Queres que adicione spots secretos já?** Ou primeiro os spots públicos todos?
4. **Achas que deva integrar dados do IPMA/Hidrográfico reais?** (bandeiras, qualidade da água)
5. **Queres que crie uma estrutura para a comunidade contribuir?** (tipo "Contribuir" no GitHub com dicas de spots)

---

*WindSpot — feito por surfers, para surfers. Ninguém sabe Portugal como nós.* 🌊🇵🇹
