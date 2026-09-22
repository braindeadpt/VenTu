# Migração i18n — plano e estado

> Item **M5** da auditoria: a UI ramifica `isPt ? 'pt' : 'EN'` em vez de usar o
> dicionário, pelo que os locales **es/de/fr recebem copy EN** em muitas
> superfícies, enquanto o sitemap anuncia 5 hreflangs por URL.
>
> Medição reproduzível: `node scripts/i18n-debt-report.js` (ou `--json`).

## Estado (2026-09-22, após a superfície news)

| Métrica | Valor |
|---|---:|
| Ficheiros `src/**` | 526 |
| Sem dívida (limpos) | 417 |
| Com ternários de copy | **109** |
| Ternários de copy | **649** |

Progresso desde o início da migração: 672 → 649 ternários, 116 → 109 ficheiros
(superfícies `fontes` e `news` fechadas).

### Por superfície (ternários)

| Superfície | Dívida |
|---|---:|
| `src/components/spots` | 210 |
| `src/app/[locale]` (páginas) | 61 |
| `src/components/about` | 55 |
| `src/components/homepage` | 52 |
| `src/components/ui` | 43 |
| `src/components/account` | 30 |
| `src/components/DawnPatrolBanner.tsx` | 23 |
| `src/components/FeedbackForm.tsx` | 22 |
| `src/components/auth` | 17 |
| `src/components/layout` | 15 |

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

Em ambas, a copy **pt/en ficou byte-idêntica** (baselines visuais intactas) e
es/de/fr deixaram de receber inglês.

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
