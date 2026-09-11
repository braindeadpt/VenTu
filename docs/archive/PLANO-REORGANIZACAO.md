# VenTu — Plano de Reorganização e Redesign

## Estado Atual (Problemas Identificados)

### 1. INCONSISTÊNCIA VISUAL
- **Frontpage**: Novo design (moderno, limpo, glassmorphism)
- **Spot Grid (/spots)**: Design antigo com filtros básicos
- **Spot Detail**: Layout confuso — demasiada informação sem hierarquia
- **Compare**: Cards antiquados, informação repetida
- **Favorites**: Cards antiquados

### 2. DADOS/DESPORTOS — CONFUSÃO CRÍTICA
**Problema**: Cada spot mostra ratings para TODOS os desportos, mesmo quando:
- Spot é só para surf → mostra kitesurf rating 2/10
- Spot é lagoa → mostra surf rating 1/10
- Não há distinção clara do que é relevante vs irrelevante

**Exemplo do caos**:
```
Guincho (spot de surf/kitesurf):
- Surf: 8/10 ✅
- Kitesurf: 9/10 ✅
- Windsurf: 7/10 ✅
- Wakeboard: 2/10 ❌ (lógico, não tem cable park)
- Bodyboard: 6/10 ⚠️ (pode ser, mas não é o focus)
- SUP: 5/10 ⚠️ (pode ser, mas irrelevante)
```

**O utilizador vê 6 ratings mas só 3 fazem sentido!**

### 3. FILTROS NÃO FUNCIONAM CORRETAMENTE
- Filtro "Surf" na homepage pode mostrar spots que têm ondas mas não são spots de surf
- Score geral (0-100) mistura condições de surf + kitesurf + windsurf → não reflete nenhum desporto específico
- Quando filtra por "Kitesurf", o score deveria ser baseado em VENTO, não em ONDAS

### 4. PÁGINA DE SPOT — INFORMATION OVERLOAD
Atualmente mostra:
- Condições atuais (9 campos)
- Surfability Score (com 5 sub-scores)
- Session Quality Forecast (gráfico)
- Magic Windows (horários)
- Swell Detective
- Local Tips
- Secret Tips
- Water Quality
- Spot Chat
- Mapa
- Facilities (lista grande)
- Hazards (lista grande)
- Forecast Chart (gráfico)
- Condition Card

**TUDO na mesma página, sem hierarquia!**

---

## PLANO DE REORGANIZAÇÃO

### FASE 1: Arquitetura de Dados por Desporto (Fundamental)

**Objetivo**: Cada spot só mostra o que é relevante para o desporto selecionado.

#### 1.1 Sistema de Compatibilidade Clara
```typescript
interface Spot {
  // ... campos existentes
  
  // NOVO: Desportos PRIMÁRIOS (o que este spot É)
  primarySports: SportType[];  // Ex: ['surf', 'kitesurf'] para Guincho
  
  // NOVO: Desportos POSSÍVEIS (funciona mas não é ideal)
  possibleSports: SportType[];   // Ex: ['bodyboard', 'sup'] para Guincho
  
  // NOVO: Desportos INCOMPATÍVEIS
  incompatibleSports: SportType[]; // Ex: ['wakeboard'] para Guincho
}
```

#### 1.2 Score por Desporto (NÃO score geral misturado)
```typescript
// REMOVER: calculateSurfability() que mistura tudo
// SUBSTITUIR POR:

function getSportScore(spot: Spot, sport: SportType, conditions: Conditions): {
  score: number;        // 0-100 para ESTE desporto
  rating: string;       // "Épico!", "Bom", "Razoável"
  factors: {
    primary: string;    // Factor principal (ondas para surf, vento para kite)
    secondary: string;  // Factor secundário
    warning?: string;   // Aviso se aplicável
  }
}

// Surf: score baseado em ondas + vento offshore
// Kitesurf: score baseado em vento forte + ondas pequenas
// Windsurf: score baseado em vento moderado
// Wakeboard: score = 0 se não tiver cable park
```

#### 1.3 Filtros que FUNCIONAM
```typescript
// Quando user filtra "Kitesurf":
// 1. Mostrar só spots onde kitesurf é PRIMARY ou POSSIBLE
// 2. Ordenar por score de KITESURF (não score geral)
// 3. Card mostra: Vento XXkt | Score YY/100 | "Vento forte, perfeito!"

// Quando user filtra "Surf":
// 1. Mostrar só spots onde surf é PRIMARY ou POSSIBLE  
// 2. Ordenar por score de SURF
// 3. Card mostra: Ondas XXm | Score YY/100 | "Ondas perfeitas!"
```

### FASE 2: Redesign Consistente de TODAS as Páginas

#### 2.1 Sistema de Design Unificado

**Cores por Desporto** (consistente em TODO o site):
```
Surf:      Cyan (#06b6d4) — ondas
Kitesurf:  Sky (#0ea5e9) — vento/ar  
Windsurf:  Blue (#3b82f6) — água+vento
Wakeboard: Purple (#8b5cf6) — cable park
Bodyboard: Teal (#14b8a6) — body
SUP:       Emerald (#10b981) — paddle
```

**Quando user seleciona um desporto, TODO o site usa essa cor!**

#### 2.2 Componentes Base (reutilizáveis)

```typescript
// Card de Spot Universal
interface SpotCardProps {
  spot: Spot;
  sport: SportType;        // Desporto ativo
  score: number;           // Score para ESTE desporto
  conditions: Conditions;  // Condições atuais
  variant: 'grid' | 'list' | 'featured';  // Tamanho/importância
}

// Seção de Condições por Desporto
interface SportConditionsProps {
  spot: Spot;
  sport: SportType;
  conditions: Conditions;
}
// Mostra só os campos relevantes para o desporto:
// Surf → Ondas (altura, período, direção) + Vento (direção offshore)
// Kitesurf → Vento (velocidade, rajadas) + Ondas (pequenas = bom)
// Wakeboard → N/A (só aberto/FECHADO do cable park)
```

#### 2.3 Páginas a Redesenhar (ordem de prioridade)

**P1 — Spot Detail (mais importante)**
```
Layout novo (uma coluna, scroll natural):

[HEADER]
- Nome do spot + Região
- Score grande (0-100) para o desporto selecionado
- Badge do desporto ativo (colorido)
- Botão favorito

[CONDIÇÕES AO VIVO] 
- 3 cards principais (só o relevante para o desporto):
  Surf: [Ondas X.Xm @ XXs] [Vento XXkt direção] [Temp Água XX°C]
  Kite: [Vento XXkt rajadas XX] [Ondas X.Xm] [Temp Água XX°C]
- Gráfico forecast (24h) — linha simples

[RECOMENDAÇÃO]
- Texto: "Hoje está ÉPICO para surf! Ondas de 2m com vento offshore."
- Crowd estimado
- Melhor horário (Magic Window)

[MAPA]
- Mapa OpenStreetMap (pequeno, clicável)

[INFORMAÇÃO DO SPOT]
- Tipo de spot, Dificuldade, Melhor maré
- Facilities (ícones, só os que existem)
- Hazards (se houver)

[CHAT]
- Chat da comunidade (sempre visível, compacto)

[FOOTER]
- Links, stats
```

**P2 — Spot Grid (/spots)**
```
[FILTROS STICKY]
- Desporto: [Todos] [Surf] [Kitesurf] [Windsurf] [...]
- Região: [Norte] [Centro] [Lisboa] [...]
- Dificuldade: [Iniciante] [...]
- Score mínimo: [slider 0-100]

[GRID DE CARDS]
- 3 colunas desktop, 2 tablet, 1 mobile
- Card limpo: Imagem | Nome | Score | 3 stats | Sport badge
- Ordenado por score do desporto selecionado

[SE NENHUM FILTRO]
- Mostrar "Top 6 hoje" em destaque
- Depois lista completa
```

**P3 — Compare**
```
[HEADER]
- "Comparar Spots" + Seletor de desporto

[SELETOR DE SPOTS]
- Search/dropdown para adicionar spots
- Max 3 spots

[COMPARISON TABLE]
- Tabela lado a lado (não cards sobrepostos)
- Linhas: Score, Ondas, Vento, Temperatura, Crowd, Melhor hora
- Highlight no melhor de cada categoria

[GRÁFICO COMPARATIVO]
- Gráfico de barras: Score de cada spot
```

**P4 — Favorites**
```
[GRID IGUAL AO /spots]
- Mas só os favoritos
- Alerta se condições mudaram desde a última visita
```

**P5 — Homepage (já feito, mas ajustar)**
```
- Conectar com novo sistema de scores por desporto
- Quando filtra desporto, hero muda para spot #1 desse desporto
```

### FASE 3: Simplificação de Dados

#### 3.1 Remover Information Overload

**Spot Detail — O que MANTER vs REMOVER:**

| Atual | Decisão | Motivo |
|-------|---------|--------|
| 9 campos de condições | 3 campos relevantes | Só o que importa para o desporto |
| Surfability + 5 sub-scores | 1 score (0-100) | Um número é mais claro |
| Session Quality Forecast | Manter, simplificar | Útil mas grande demais |
| Magic Windows | Manter, compactar | Útil |
| Swell Detective | REMOVER ou esconder | Demasiado técnico para 90% dos users |
| Local Tips | Manter | Valor real |
| Secret Tips | Manter (se existir) | Valor real |
| Water Quality | Manter (badge pequeno) | Importante mas secundário |
| Spot Chat | Manter, compactar | Comunidade |
| Forecast Chart | Simplificar | Útil mas ocupado |
| Facilities (lista) | Ícones só (sem texto) | Visual, rápido |
| Hazards (lista) | Ícones só (se houver) | Só se relevante |

#### 3.2 Score Único por Desporto

**Remover o score "geral" misturado. Substituir por:**

```typescript
// Cada spot tem scores calculados para CADA desporto
const spotScores: Record<SportType, {
  score: number;      // 0-100
  rating: string;     // "Épico", "Bom", "Razoável"
  factors: string[];  // ["Ondas 2.1m", "Vento offshore 15kt"]
  warning?: string;     // "Vento forte para iniciantes"
}>

// Exemplo Guincho:
{
  surf: { score: 85, rating: "Épico", factors: ["Ondas 2.1m", "Noroeste limpo"] },
  kitesurf: { score: 90, rating: "Épico", factors: ["Vento N 25kt", "Ondas pequenas"] },
  windsurf: { score: 75, rating: "Bom", factors: ["Vento moderado"] },
  wakeboard: { score: 0, rating: "N/A", warning: "Sem cable park" },
  bodyboard: { score: 80, rating: "Bom", factors: ["Ondas pequenas", "Fechado"] },
  sup: { score: 60, rating: "Razoável", factors: ["Ondas pequenas"] }
}
```

### FASE 4: Implementação Ordenada

**Sem fazer tudo de uma vez — passo a passo:**

```
Semana 1:
├── Dia 1-2: Reescrever sistema de scores (sport-specific)
├── Dia 3: Atualizar SpotCard (componente universal)
├── Dia 4: Redesenhar Spot Detail (P1)
└── Dia 5: Testar + Ajustar

Semana 2:
├── Dia 1-2: Redesenhar Spot Grid (/spots) com filtros novos
├── Dia 3-4: Redesenhar Compare + Favorites
└── Dia 5: Testar + Polir

Semana 3:
├── Dia 1-2: Ajustar Homepage (conectar com novo sistema)
├── Dia 3-4: Animações, transições, efeitos finais
└── Dia 5: Teste completo + Deploy
```

### FASE 5: Testes de Usabilidade

**Checklist antes de considerar "pronto":**

1. [ ] User consegue filtrar por "Kitesurf" e ver só spots de kite ordenados por vento
2. [ ] User consegue filtrar por "Surf" e ver só spots de surf ordenados por ondas
3. [ ] Spot detail mostra só 3 stats relevantes (não 9)
4. [ ] Score é claro (0-100) para o desporto selecionado
5. [ ] Não há informação irrelevante (wakeboard score em spot de surf = N/A)
6. [ ] Layout é limpo — user sabe onde clicar em < 3 segundos
7. [ ] Site é consistente — mesmos componentes em todas as páginas
8. [ ] Mobile funciona bem (touch friendly, scroll natural)

---

## PRÓXIMO PASSO

**Esperar aprovação do utilizador** antes de começar a implementar.

O utilizador deve confirmar:
1. ✅ Plano faz sentido?
2. ✅ Prioridades estão corretas?
3. ✅ Começar pela Fase 1 (scores por desporto)?
4. ✅ Ou prefere ajustar algo primeiro?

**Depois da aprovação**: Implementar Fase 1 → Fase 2 → etc.
