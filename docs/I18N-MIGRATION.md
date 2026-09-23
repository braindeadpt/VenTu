# Migração i18n — plano e estado

> Item **M5** da auditoria: a UI ramifica `isPt ? 'pt' : 'EN'` em vez de usar o
> dicionário, pelo que os locales **es/de/fr recebem copy EN** em muitas
> superfícies, enquanto o sitemap anuncia 5 hreflangs por URL.
>
> Medição reproduzível: `node scripts/i18n-debt-report.js` (ou `--json`).

## Estado (2026-09-23, após account + DawnPatrolBanner)

| Métrica | Valor |
|---|---:|
| Ficheiros `src/**` | 526 |
| Sem dívida (limpos) | 425 |
| Com ternários de copy | **102** |
| Ternários de copy | **554** |

Progresso: 672 → 554 ternários, 116 → 102 ficheiros (superfícies `fontes`,
`news`, `auth`, `account`, `DawnPatrolBanner`, `HomepageSearch` e
`FeedbackForm` fechadas).

### Por superfície (ternários)

| Superfície | Dívida |
|---|---:|
| `src/components/spots` | 210 |
| `src/app/[locale]` (páginas) | 61 |
| `src/components/about` | 55 |
| `src/components/homepage` | 52 |
| `src/components/ui` | 42 |
| `src/components/layout` | 15 |
| `src/lib/mapSpotNarrative.ts` | 11 |
| `src/components/weather` | 11 |

## Método (por superfície)

1. **Medir**: `node scripts/i18n-debt-report.js` — escolher a superfície (maior
   tráfego primeiro: spots → homepage → about → account → news).
2. **Dicionário**: acrescentar o bloco novo (ex.: `coastalArchive`) **aos 5**
   ficheiros `src/lib/translations/{pt,en,es,de,fr}.ts`, com `{placeholder}`
   (convenção `.replace('{x}', …)`). Os testes de i18n exigem: shell ⊇ pt,
   nenhum valor vazio, nenhuma shell igual ao placeholder pt, e (guard novo)
   nenhuma key fora do pt.
3. **Componente**: trocar `isPt ? 'pt' : 'EN'` por `getTranslation(locale).bloco.key`.
   Manter os ternários de **código de língua** (`isPt ? 'pt-PT' : 'en-GB'`) — a
   regra do eslint ignora-os de propósito. **Copy pt/en tem de ficar
   byte-idêntica** para não mexer nas baselines visuais.
4. **Travar a regressão**: acrescentar a superfície a `MIGRATED_GLOBS` em
   `eslint.config.mjs` (só depois de a superfície estar 100% migrada; a regra
   passa a falhar novos ternários de copy aí).
5. **Verificar**: `npm run lint`, `npx tsc --noEmit`,
   `npx vitest run src/lib/__tests__/i18nLocales.test.ts`, e o e2e da superfície
   (`npm run test:e2e:core` cobre as principais).

## Exemplares migrados

1. `src/components/fontes/CoastalArchiveCard.tsx` — 4 strings + plural (dia/dias) +
   frase com link inline (`footerBefore`/`aboutLink`/`footerAfter`), bloco
   `coastalArchive` nas 5 línguas, superfície `src/components/fontes/**`.
2. **Superfície `news` completa** (23 strings em 7 ficheiros: `NewsCard`,
   `NewsFilters`, `NewsDetailHeader`, `NewsPagination`, `NewsArchiveClient`,
   `RelatedNews` e `app/[locale]/news/[slug]/page.tsx`) — bloco `news` alargado
   nas 5 línguas, incluindo datas (Hoje/7 dias/30 dias), regiões (Cena PT /
   Internacional) e o empty-state com `{query}`. `src/components/news/**` e
   `src/app/[locale]/news/**` passaram a estar em `MIGRATED_GLOBS`.

3. **Superfície `auth`** (17 strings em 2 ficheiros: `LoginModal`,
   `AuthCallbackClient`) — bloco `auth` novo nas 5 línguas (títulos por motivo,
   subtítulos, enviar/enviado, placeholders, estados do callback); o «Fechar»
   reutiliza `common.close`. `src/components/auth/**` em `MIGRATED_GLOBS`.

4. **`HomepageSearch` + `FeedbackForm`** (23 strings em 2 ficheiros) — o botão
   de busca do hero reutiliza `hero.searchPlaceholder`; o formulário de
   feedback ganhou o bloco `feedback` (tipos/tipos-de-dica, descrições,
   placeholders, erros incl. rate-limit, envio, agradecimento) e o cast
   `getTranslation(locale as 'pt' | 'en')` saiu. Ambos os ficheiros entraram em
   `MIGRATED_GLOBS` (entradas por ficheiro).

5. **Superfície `account`** (30 strings em 2 ficheiros: `AccountClient`,
   `TelegramLinkCard`) — bloco `account` novo nas 5 línguas, e o
   `alertModeLabel` de `src/lib/userAlerts.ts` passou de `isPt: boolean` para
   `locale: string` (usa `alerts.modeImmediate`/`modeDigest`), corrigindo
   também o painel de alertas que ainda mostrava o modo em inglês em es/de/fr.
   `src/components/account/**` em `MIGRATED_GLOBS`.

6. **`DawnPatrolBanner`** (23 strings) — bloco `dawnPatrol` novo nas 5 línguas
   (indisponível/retry, vereditos, aviso de mar perigoso, selo «desactualizado»
   + tooltip, «Ver Spot/Spots» — este reutiliza `hero.cta` —, melhor hora, fato,
   vereditos de hoje, spot em destaque/todos) e o helper
   `recalibrationTitle` passa a receber as etiquetas em vez do booleano `isPt`.
   Os casos com ramos iguais (`Dawn Patrol`, `Score:`, `SKIP`) deixam de ser
   ternários; `src/components/DawnPatrolBanner.tsx` entra em MIGRATED_GLOBS.

Em todas, a copy **pt/en ficou byte-idêntica** (baselines visuais intactas) e
es/de/fr deixaram de receber inglês.

## Superfície `about` — FECHADA (2026-09-23)

Migrada em 6 blocos (commits `91fd415`, `6198ed5`, `0fd3bf4`, `19c2867`,
`e83a57b`, `6fafae5`): Tide (14 keys), Radar (14), Archive (11), Skill (20),
IH key (32) e página (33). `src/components/about/**` e
`src/app/[locale]/about/**` estão em MIGRATED_GLOBS; a regra do eslint confirmou
os ficheiros 100% limpos. Corrigidos de passagem: a coluna «Fonte» da tabela do
arquivo (estava fixa em PT) e as 6 descrições de tecnologia da página (estavam
fixas em EN). Ronda de baselines necessária para o `/es/about/`.

## Estado da migração (2026-09-23) — sessão grande

**672 → 420 ternários · 116 → 85 ficheiros** (12 superfícies fechadas):
`fontes`, `news`, `auth`, `account`, `DawnPatrolBanner`, `HomepageSearch`,
`FeedbackForm`, `about` (6 blocos), `layout` (4 ficheiros por glob),
`weather` (3 ficheiros), as cópias do cluster de libs (`voice`,
`emptyStateCopy`, `mapSpotNarrative`, `spotListCardDelight`), `ScoreFeedback`
e a página `/fontes` + 4 ficheiros de `ui` (SocialShare,
AggregateScoreGauge, ErrorState, WarningPill).

### Acelerador (usar na próxima ronda)

`node /tmp/add-i18n-keys.js <bloco> <ficheiro.json>` insere keys nas 5 línguas
de uma vez (cria o bloco se não existir, âncora `spotPageVerdict`). JSON no
formato `{ "chave": { "pt": "…", "en": "…", "es": "…", "de": "…", "fr": "…" } }`.
Os testes de i18n (14) validam logo: shells ⊇ pt, sem placeholders iguais ao pt
(allowlists justificadas em `src/lib/__tests__/i18nLocales.test.ts`) e o guard
inverso de leftovers.

### O que falta (por ordem sugerida)

| Superfície | Dívida | Notas |
|---|---:|---|
| `src/components/spots` | ~210 | a maior; faseada por componente (SpotListCard, SpotDetailHero, sections, mapa, ScoreWave/WindSourceBadge) |
| páginas `app/[locale]` | ~61 | por página; algumas têm frases com links inline |
| `src/components/homepage` | ~52 | homes es/de/fr estão nas baselines |
| `src/components/ui` | ~33 | ScoreWaveSourceBadge (12, templates com sufixos), FreshnessIndicator (7), ScoreWindSourceBadge (7), DataSourceBadge (3), ConfidenceBadge (2 + lib `forecastConfidence`) |
| outros | ~20 | `mapSpotNarrative` já feito; restam helpers pontuais |

Método por bloco: ler ternárias → JSON + acelerador → migrar componente →
`npm run lint` (com o glob do ficheiro) + `npx tsc --noEmit` +
`vitest run src/lib/__tests__/i18nLocales.test.ts` → commit → e, no fim de cada
superfície capturada, `Record Visual Baselines`.

## Nota SEO (decisão em aberto)

Enquanto a migração não fechar, `/es/ /de/ /fr/` servem EN em parte das
superfícies, mas o sitemap continua a anunciar 5 hreflangs (risco de conteúdo
duplicado/fino). Duas opções, por ordem de preferência:

1. continuar a migração por superfície (este plano) — sem perder mercados;
2. se for preciso fechar o risco antes disso, limitar `generate-sitemap.js` e os
   `hreflang` às línguas realmente traduzidas por superfície (trabalho maior e
   reversível).

Nenhuma das duas é feita neste lote: é uma decisão de produto/SEO, registada
aqui para não se perder.
