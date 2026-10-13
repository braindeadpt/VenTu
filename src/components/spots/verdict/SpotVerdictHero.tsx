'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Navigation, Video } from 'lucide-react';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import type { SpotVerdictConditions } from '@/components/spots/page/SpotVerdictSection';
import { getGoogleMapsDirectionsUrl } from '@/lib/mapSpotDetail';
import { getSpotScoreFactors } from '@/lib/spotScoreFactors';
import { formatHourLong } from '@/lib/verdict/formatHourLabel';
import { getDataFreshness, formatStaleAge } from '@/lib/dataFreshness';
import { getConfidenceLabel, getConfidenceTier } from '@/lib/forecastConfidence';
import { getTranslation } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import {
  useSpotTimelineData,
  useSpotTimelineIndex,
} from '@/components/spots/timeline/useSpotTimeline';
import SpotLevelToday from '@/components/spots/SpotLevelToday';
import FavoriteButton from '@/components/FavoriteButton';
import SpotAlertPopover from '@/components/spots/SpotAlertPopover';
import SpotMoreMenu from '@/components/spots/verdict/SpotMoreMenu';
import SpotBreadcrumb from '@/components/spots/quick/SpotBreadcrumb';
import type {
  ScoreWaveCorrection,
  ScoreWaveSource,
  ScoreWindCorrection,
  ScoreWindSource,
} from '@/lib/scoreConditions';

interface SpotVerdictHeroProps {
  spot: Spot;
  locale: string;
  backLabel: string;
  directionsLabel: string;
  livecamLabel?: string;
  selectedSport: SportType;
  /** Score «agora» com correcções — fallback antes de montar (o eixo ainda está em 0). */
  score: SportScore;
  conditions: SpotVerdictConditions;
  /** Todos os scores — o formatador canónico do «porquê» (spotScoreFactors,
   *  o mesmo do popup do mapa) resolve o desporto explicado daqui. */
  allScores: Record<SportType, SportScore>;
  /** Fonte da onda/vento do score «agora» (correcção por boia/estação). */
  scoreWaveSource?: ScoreWaveSource;
  scoreWaveCorrection?: ScoreWaveCorrection | null;
  scoreWindSource?: ScoreWindSource;
  scoreWindCorrection?: ScoreWindCorrection | null;
  freshnessNowMs?: number;
}

/** Primeira letra minúscula — o segmento fica a meio de frase («…há 12h»). */
const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/**
 * §1 da spec v3 — «posso ir?». Grelha de 12 colunas no desktop: 1–7 levam
 * voltar/região·coords/nome/linha de tempo; 8–12 levam o score (mono,
 * --verdict), «/100», a banda e a frase de porquê. No mobile o nome e o
 * score partilham a mesma linha (o nome quebra, o score nunca sai).
 *
 * Hierarquia de acções: 1 primária («Como chegar», flex-1 no mobile) +
 * fantasmas de 44 px (♡ · Alerta · Câmara) + menu «Mais». Os fantasmas
 * mostram rótulo a partir de 640 px e só ícone abaixo, sempre com
 * aria-label. Os chips de proveniência saíram do hero: ficam só em
 * «Como sabemos» — aqui fica UMA linha calma (fonte · confiança · frescura
 * · link), com âmbar em texto só para confiança baixa e frescura fora do
 * TTL (getDataFreshness — 2,5 h de dia / 5 h de noite, Lisboa).
 */
export default function SpotVerdictHero({
  spot,
  locale,
  backLabel,
  directionsLabel,
  livecamLabel,
  selectedSport,
  score,
  conditions,
  allScores,
  scoreWaveSource = 'forecast',
  scoreWaveCorrection = null,
  scoreWindSource = 'forecast',
  scoreWindCorrection = null,
  freshnessNowMs,
}: SpotVerdictHeroProps) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale);
  const tv = t.spotPageVerdict;
  const tq = t.spotPageQuick;
  const { nowIndex, nowResolved } = useSpotTimelineData();
  const { selectedScore, selectedHour, isNow } = useSpotTimelineIndex();

  const title = isPt ? spot.name : spot.nameEn;
  const region = isPt ? spot.region : spot.regionEn;
  const directionsUrl = getGoogleMapsDirectionsUrl(spot.lat, spot.lon);

  // Score da hora escolhida — alimenta o «Nível hoje» (o display grande
  // do score vive no SpotVerdictCard do deck rápido, #184).
  const target = selectedScore ?? score.score;

  // Linha meta do contrato: «Ericeira · Intermédio · Direita clássica» —
  // região, nível e tipo de spot; os chips (Bandeira Azul, qualidade da
  // água) vêm a seguir. Sem campos inventados: só o que o spot declara.
  const DIFF_KEY: Record<Spot['difficulty'], keyof typeof t.spots> = {
    beginner: 'beginner',
    intermediate: 'intermediate',
    advanced: 'advanced',
    expert: 'expert',
    all: 'allLevels',
  };
  const TYPE_KEY: Record<Spot['type'], keyof typeof t.spots | null> = {
    surf: 'surf',
    kitesurf: 'kitesurf',
    windsurf: 'windsurf',
    'big-wave': 'bigWave',
    foil: 'foil',
    wakeboard: 'wakeboard',
    multisport: null,
  };
  const typeKey = TYPE_KEY[spot.type];
  const metaParts = [
    region,
    t.spots[DIFF_KEY[spot.difficulty]] as string,
    typeKey ? (t.spots[typeKey] as string) : null,
  ].filter(Boolean);
  const WQ_KEY: Record<string, keyof typeof t.spotPageContext> = {
    excelente: 'wqClassExcellent',
    excellent: 'wqClassExcellent',
    boa: 'wqClassGood',
    good: 'wqClassGood',
    razoavel: 'wqClassSufficient',
    fair: 'wqClassSufficient',
    má: 'wqClassPoor',
    poor: 'wqClassPoor',
  };
  const wq = isPt ? spot.waterQuality : spot.waterQualityEn;
  const wqLabel = wq ? t.spotPageContext[WQ_KEY[wq]] : null;

  // Os factores descrevem as condições actuais — escondidos quando a hora
  // escolhida é previsão (mostrar factores de «agora» sobre uma hora futura
  // induzia em erro). Antes de montar (nowIndex<0) a hora mostrada é a do
  // bake = «agora», por isso a linha fica. Uma só gramática de factores:
  // o formatador canónico do mapa (getSpotScoreFactors), não uma linha
  // própria — mapa e página dizem o mesmo «porquê».
  const why =
    isNow || !nowResolved
      ? getSpotScoreFactors({
          spot,
          conditions,
          allScores,
          sport: selectedSport,
          locale,
        })
          .map((s) => s.label)
          .join(' · ') || null
      : null;

  // Correcções observadas (boia/estação) só se aplicam ao «agora»: noutras
  // horas o score é previsão pura e a linha de fonte diz isso. Antes de
  // montar (nowIndex<0) a hora mostrada é a do bake = «agora».
  // `nowResolved` (do provider) distingue «ainda não medi» de «medi e não
  // está coberto». Sem esta distinção uma série expirada aparecia como
  // «Agora» — mentira sobre o dado.
  const showObservedSources = isNow || !nowResolved;
  // A nota de segurança offshore vive agora por cima do SpotVerdictCard
  // (deck rápido #184, contrato «por cima do veredicto»).
  // A pill segue a mesma regra: antes de montar diz «Agora» (não «Previsão»,
  // mais comprida — no mobile partia a linha da hora e a página saltava).
  const showAsNow = isNow || !nowResolved;

  // ── Linha de proveniência única ─────────────────────────────────────
  // «Onda corrigida pela boia CSA92 · vento da estação Cabo Raso ·
  //  confiança baixa · actualizado há 12 h · Como sabemos →»
  const provenance: ReactNode[] = [];
  if (showObservedSources && scoreWaveSource === 'observed' && scoreWaveCorrection?.buoyName) {
    provenance.push(
      <span key="wave">{tv.waveFromBuoy.replace('{name}', scoreWaveCorrection.buoyName)}</span>,
    );
  } else if (showObservedSources && scoreWaveSource === 'bias-corrected') {
    provenance.push(<span key="wave">{tv.waveBiasCorrected}</span>);
  } else {
    provenance.push(<span key="wave">{tv.modelLabel}</span>);
  }
  if (showObservedSources && scoreWindSource === 'observed') {
    provenance.push(
      <span key="wind">
        {scoreWindCorrection?.station
          ? tv.windFromStation.replace('{name}', scoreWindCorrection.station)
          : tv.windObserved}
      </span>,
    );
  }
  const confTier =
    conditions.confidence || conditions.confidenceDetail
      ? getConfidenceTier(conditions.confidenceDetail ?? null, conditions.confidence ?? null)
      : null;
  if (confTier) {
    // Âmbar em texto (sem fundo) só quando a confiança é baixa — spec §0.4.
    provenance.push(
      <span key="conf" className={confTier === 'baixa' ? 'text-score-fair' : undefined}>
        {tv.confidenceInline.replace(
          '{tier}',
          lowerFirst(getConfidenceLabel(confTier, locale)),
        )}
      </span>,
    );
  }
  if (conditions.updatedAt) {
    // «há 12 h» em âmbar só quando passa o TTL de frescura do projecto
    // (getDataFreshness — 2,5 h de dia / 5 h de noite, hora de Lisboa).
    const freshness = getDataFreshness(conditions.updatedAt, freshnessNowMs);
    const age = formatStaleAge(conditions.updatedAt, locale, freshnessNowMs);
    provenance.push(
      <span
        key="age"
        className={freshness && freshness !== 'fresh' ? 'text-score-fair' : undefined}
      >
        {tv.updatedAgo.replace('{age}', lowerFirst(age))}
      </span>,
    );
  }

  return (
    // `spot-hero-card` é marcador sem estilo fora de `.spot-hero-ink` — os
    // specs legados escopam as asserções do hero por esta classe.
    <header
      id="agora"
      data-spot-slug={spot.slug}
      className="spot-hero-card scroll-mt-32 border-b border-divider"
    >
      <div className="max-w-6xl mx-auto px-4 pt-2 pb-5">
        {/* Preserva a modalidade: /spots/ lê ?sport= — o voltar não a perde. */}
        <Link
          href={`/${locale}/spots/?sport=${selectedSport}`}
          className="inline-flex items-center gap-1.5 min-h-[44px] -mt-1 text-meta-sm text-fg-muted hover:text-fg transition-colors duration-150"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          {backLabel}
        </Link>

        {/* Breadcrumb «Portugal › Região › Spot» (contrato #184). */}
        <SpotBreadcrumb spot={spot} locale={locale} />

        <div className="mt-1.5 space-y-1.5">
          {/* h1 fluido — nunca transborda a 360/390 (#198): clamp entre
              32 px e 64 px, com o nome a poder quebrar linha livremente. */}
          <h1 className="font-display text-[clamp(2rem,9vw+0.5rem,4rem)] leading-[1.05] tracking-tight text-fg text-balance">
            {title}
          </h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-meta-sm text-fg-muted">
            {metaParts.map((part, i) => (
              <span key={i} className="inline-flex items-center gap-x-2">
                {i > 0 && <span aria-hidden>·</span>}
                {part}
              </span>
            ))}
          </p>
          {(spot.blueFlag || wqLabel) && (
            <p className="flex flex-wrap gap-2 pt-0.5">
              {spot.blueFlag && (
                <span className="rounded-pill border border-divider px-2.5 py-1 text-meta-sm text-fg-muted">
                  {tq.flagBlue}
                </span>
              )}
              {wqLabel && (
                <span className="rounded-pill border border-divider px-2.5 py-1 text-meta-sm text-fg-muted">
                  {wqLabel}
                </span>
              )}
            </p>
          )}
          {Number.isFinite(conditions.waterTemp) && conditions.waterTemp > 0 && (
            <p className="text-meta-sm text-fg-muted">
              {tq.waterTempLine.replace(
                '{temp}',
                String(Math.round(conditions.waterTemp)),
              )}
            </p>
          )}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta-sm text-fg-muted">
            <span className="font-mono tabular-nums text-fg">
              {selectedHour ? formatHourLong(selectedHour, locale) : '--:--'}
            </span>
            {/* A pill existe sempre — invisível enquanto o relógio não está
                resolvido (HTML baked). Aparecer só depois da hidratação
                crescia a linha 4–5 px e empurrava a página (CLS 0,2).
                A visibilidade segue `nowResolved`, NÃO `nowIndex`: um
                `nowIndex` de −1 significa agora DUAS coisas — «ainda não
                medi» e «medi, mas a série expirou» — e no segundo caso o
                aviso tem de ser visível, porque dizer «Agora» seria
                mentir sobre o dado. */}
            <span
              aria-hidden={!nowResolved || undefined}
              className={cn(
                'rounded-pill border px-2 py-0.5 text-meta-sm font-medium',
                !nowResolved && 'invisible',
                nowIndex < 0 || isNow
                  ? 'border-divider-strong text-fg'
                  : 'border-divider text-fg-muted',
              )}
            >
              {nowIndex < 0
                ? tv.outsideCoverageLabel
                : isNow
                  ? tv.nowLabel
                  : tv.forecastLabel}
            </span>
          </p>
          {why && (
            <p className="text-meta-sm text-fg-muted leading-snug truncate">
              {why}
            </p>
          )}
          <SpotLevelToday difficulty={spot.difficulty} score={target} locale={locale} />
        </div>

        {/* Hierarquia de acções: 1 primária; fantasmas 44 px com rótulo
            ≥640 px (só ícone abaixo, sempre com aria-label); «Mais» fecha. */}
        <div className="mt-3 flex items-center gap-2">
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex flex-1 sm:flex-none items-center justify-center gap-2 font-medium',
              'px-4 min-h-[44px] h-11 text-sm rounded-input',
              'bg-accent hover:bg-accent-hover active:bg-accent-active border border-transparent',
              'transition-opacity duration-150 shadow-card',
            )}
          >
            <Navigation className="w-4 h-4" aria-hidden />
            {directionsLabel}
          </a>
          {/* Fantasma 44×44: a borda vem do wrapper (FavoriteButton é
              partilhado — o ícone é sempre só o coração). */}
          <span className="inline-flex [&>button]:h-11 [&>button]:w-11 [&>button]:rounded-input [&>button]:border [&>button]:border-divider-strong [&>button]:bg-transparent [&>button]:text-fg-muted [&>button]:hover:text-fg [&>button]:hover:border-fg-subtle [&>button]:hover:scale-100">
            <FavoriteButton spotId={spot.id} spotName={spot.name} size="md" locale={locale} />
          </span>
          {/* Fantasma «Alerta»: rótulo a partir de 640 px; abaixo disso o
              botão fica quadrado (texto a 0 px — o aria-label mantém-se). */}
          <span className="inline-flex [&>div>button]:h-11 [&>div>button]:min-h-[44px] [&>div>button]:rounded-input [&>div>button]:border-divider-strong [&>div>button]:text-fg-muted [&>div>button]:hover:text-fg [&>div>button]:hover:border-fg-subtle max-sm:[&>div>button]:w-11 max-sm:[&>div>button]:px-0 max-sm:[&>div>button]:justify-center max-sm:[&>div>button]:gap-0 max-sm:[&>div>button]:text-[0px]">
            <SpotAlertPopover spotId={spot.id} sport={selectedSport} locale={locale} />
          </span>
          {livecamLabel && (
            <a
              href="#spot-livecam"
              aria-label={livecamLabel}
              className={cn(
                'inline-flex items-center justify-center gap-2 font-medium',
                'w-11 sm:w-auto sm:px-3 min-h-[44px] h-11 rounded-input',
                'border border-divider-strong text-fg-muted',
                'hover:text-fg hover:border-fg-subtle transition-colors duration-150',
              )}
            >
              <Video className="w-4 h-4" aria-hidden />
              <span className="hidden sm:inline text-sm">{livecamLabel}</span>
            </a>
          )}
          {/* «Mais» com o mesmo contrato dos fantasmas — rótulo ≥640 px,
              só ícone abaixo (aria-label mantém-se no botão interno). */}
          <span className="inline-flex max-sm:[&>div>button]:w-11 max-sm:[&>div>button]:px-0 max-sm:[&>div>button]:gap-0 max-sm:[&>div>button]:text-[0px]">
            <SpotMoreMenu
              label={tv.moreLabel}
              menuLabel={tv.moreMenuLabel}
              shareLabel={tv.shareLabel}
              shareTitle={`${title} — ${region}`}
              spotId={spot.id}
              spotName={spot.name}
              locale={locale}
            />
          </span>
        </div>

        {/* Linha de proveniência única — os chips vivem em #como-sabemos. */}
        <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-meta-sm text-fg-muted">
          {provenance.map((seg, i) => (
            <span key={i} className="inline-flex items-center gap-x-1.5">
              {i > 0 && <span aria-hidden>·</span>}
              {seg}
            </span>
          ))}
          <a
            href="#como-sabemos"
            className="inline-flex items-center gap-x-1.5 min-h-[44px] -my-3 text-fg-muted hover:text-fg transition-colors duration-150"
          >
            <span aria-hidden>·</span>
            <span className="underline underline-offset-2 decoration-divider-strong">
              {tv.howWeKnow} →
            </span>
          </a>
        </p>
      </div>
    </header>
  );
}
