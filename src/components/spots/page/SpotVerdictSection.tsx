'use client';

import { useEffect, useRef } from 'react';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import type { SpotVerdict } from '@/lib/spotVerdict';
import type { HourlyCondition, MagicWindow } from '@/lib/magicWindows';
import type { ObservedConditions } from '@/lib/observations';
import type { ObservedWave, ObservedWaveMeta } from '@/lib/observedWave';
import type { ConfidenceDetail, ConfidenceTier } from '@/lib/forecastConfidence';
import type {
  ScoreWaveCorrection,
  ScoreWaveSource,
  ScoreWindCorrection,
  ScoreWindSource,
} from '@/lib/scoreConditions';
import { useSpotHeroScrolledPast } from '@/hooks/useSpotHeroScrolledPast';
import SpotDetailHero from '@/components/spots/SpotDetailHero';
import SpotStickyBar from '@/components/spots/SpotStickyBar';
import SportTab from '@/components/spots/SportTab';
import WhenToGoCard from '@/components/spots/WhenToGoCard';

/** Condições actuais do spot — campos consumidos pelo hero + barra sticky. */
export interface SpotVerdictConditions {
  waveHeight: number;
  wavePeriod: number;
  waveDirection: number;
  swellHeight?: number;
  windSpeed: number;
  windDirection: number;
  windGust: number;
  waterTemp: number;
  source?: 'real' | 'mock';
  updatedAt?: string;
  confidence?: ConfidenceTier;
  confidenceDetail?: ConfidenceDetail;
  observed?: ObservedConditions;
  observedWave?: ObservedWave;
  observedWaveAlt?: ObservedWave;
  observedWaveMeta?: ObservedWaveMeta;
}

/**
 * Secções 0–3 do contrato (docs/design/SPOT-PAGE.md) — dona: S2A.
 * Faixa de segurança + veredicto («posso ir?», #agora) + barra fixa única
 * (tabs modalidade) + «Quando ir» (#quando). Por agora renderiza os
 * componentes existentes com as mesmas props; a S2A redesenha o interior.
 */
export interface SpotVerdictSectionProps {
  spot: Spot;
  locale: string;
  /** «Voltar aos spots». */
  backLabel: string;
  /** «Direcções». */
  directionsLabel: string;
  /** Chip âncora «Câmara ao vivo» no hero (só se o spot tiver livecam). */
  livecamLabel?: string;
  selectedSport: SportType;
  /** Score da modalidade seleccionada (correcções observadas incluídas). */
  score: SportScore;
  conditions: SpotVerdictConditions;
  scoreWindSource?: ScoreWindSource;
  scoreWindCorrection?: ScoreWindCorrection | null;
  windObservedSource?: 'ipma' | 'ecowitt' | 'metar';
  scoreWaveSource?: ScoreWaveSource;
  scoreWaveCorrection?: ScoreWaveCorrection | null;
  observedWave?: ObservedWave | null;
  observedWaveAlt?: ObservedWave | null;
  observedWaveMeta?: ObservedWaveMeta | null;
  /** Tabs de modalidade — mesma lista canónica na linha standalone e na barra. */
  tabSports: SportType[];
  allScores: Record<SportType, SportScore>;
  /** Label da modalidade activa (pill de score da barra). */
  sportLabel: string;
  onSelectSport: (sport: SportType) => void;
  /** aria-label da tablist (tv.sportTabsAria). */
  sportTabsAria: string;
  /** «Quando ir». */
  whenToGoTitle: string;
  /** «Próximas 24h». */
  rangeLabel: string;
  verdict: SpotVerdict | null;
  /** Horas da faixa (mesma janela do WhenToGoCard — 24 h). */
  hourly: Array<HourlyCondition & { tideHeight?: number }>;
  /** Scores canónicos alinhados com `hourly`. */
  hourlyScores?: number[];
  windows: MagicWindow[];
  /** Relógio de frescura (bakedAtMs até montar — guarda React #418). */
  freshnessNowMs?: number;
}

export default function SpotVerdictSection({
  spot,
  locale,
  backLabel,
  directionsLabel,
  livecamLabel,
  selectedSport,
  score,
  conditions,
  scoreWindSource,
  scoreWindCorrection,
  windObservedSource,
  scoreWaveSource,
  scoreWaveCorrection,
  observedWave,
  observedWaveAlt,
  observedWaveMeta,
  tabSports,
  allScores,
  sportLabel,
  onSelectSport,
  sportTabsAria,
  whenToGoTitle,
  rangeLabel,
  verdict,
  hourly,
  hourlyScores,
  windows,
  freshnessNowMs,
}: SpotVerdictSectionProps) {
  const isPt = locale === 'pt';
  const heroRef = useRef<HTMLElement>(null);
  // O hero saiu do viewport? Partilhado pela SpotStickyBar (mostra) e pela
  // linha standalone de sport tabs (esconde-se quando a barra toma o lugar),
  // para nunca divergirem. A secção só monta depois dos dados carregarem —
  // o hero está sempre montado quando este hook corre.
  const stickyActive = useSpotHeroScrolledPast(heroRef, { enabled: true });

  // Quando a barra sticky assume, a linha standalone fica invisível mas os
  // botões continuariam focusáveis (armadilha a11y) — `inert` tira-a da tab
  // order e da a11y tree (propriedade DOM; React 18 não tem prop JSX).
  const tabsRowRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (tabsRowRef.current) tabsRowRef.current.inert = stickyActive;
  }, [stickyActive]);

  // ←/→ na tablist: roving tabs, foco segue a selecção.
  const handleTabsKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const idx = tabSports.indexOf(selectedSport);
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const next = tabSports[(idx + dir + tabSports.length) % tabSports.length];
    onSelectSport(next);
    tabsRowRef.current
      ?.querySelector<HTMLButtonElement>(`#sport-tab-${next}`)
      ?.focus();
  };

  return (
    <>
      {/* §1 — Veredicto */}
      <div id="agora" className="scroll-mt-32">
        <SpotDetailHero
          spot={spot}
          spotSlug={spot.slug}
          locale={locale}
          backLabel={backLabel}
          directionsLabel={directionsLabel}
          sport={selectedSport}
          score={score.score}
          rating={score.rating}
          ratingEn={score.ratingEn}
          factors={isPt ? score.factors : score.factorsEn}
          conditions={conditions}
          scoreWindSource={scoreWindSource}
          scoreWindCorrection={scoreWindCorrection}
          windObservedSource={windObservedSource}
          scoreWaveSource={scoreWaveSource}
          scoreWaveCorrection={scoreWaveCorrection}
          observedWave={observedWave}
          observedWaveAlt={observedWaveAlt}
          observedWaveMeta={observedWaveMeta}
          heroRef={heroRef}
          livecamLabel={livecamLabel}
          freshnessNowMs={freshnessNowMs}
        />
      </div>

      {/* §2 — Barra fixa: assume a linha de tabs quando o hero sai do ecrã. */}
      <SpotStickyBar
        score={score}
        sportLabel={sportLabel}
        conditions={conditions}
        active={stickyActive}
        locale={locale}
        spotId={spot.id}
        sports={tabSports}
        allScores={allScores}
        selectedSport={selectedSport}
        onSelectSport={onSelectSport}
        observedWave={observedWave}
        observedWaveAlt={observedWaveAlt}
        observedWaveMeta={observedWaveMeta}
        scoreWaveCorrection={scoreWaveCorrection}
        freshnessNowMs={freshnessNowMs}
      />

      <section
        // Cota de pinagem partilhada com a SpotStickyBar (globals.css): a
        // linha standalone e a barra prendem-se na mesma altura do header.
        ref={tabsRowRef}
        style={{ top: 'var(--ventu-spot-sticky-top)' }}
        className={`sticky z-20 bg-bg-base border-b border-divider supports-[backdrop-filter]:md:bg-bg-base/95 supports-[backdrop-filter]:md:backdrop-blur-sm ${
          stickyActive ? 'invisible' : ''
        }`}
        aria-hidden={stickyActive}
      >
        <div className="max-w-6xl mx-auto px-4 py-2">
          <div
            className="flex items-center gap-2 -mx-4 px-4 overflow-x-auto overscroll-x-contain no-scrollbar pb-1 edge-fade-x scroll-smooth"
            role="tablist"
            aria-label={sportTabsAria}
            onKeyDown={handleTabsKeyDown}
            style={{ height: 'var(--ventu-spot-tabs-h)' }}
          >
            {tabSports.map((sport) => (
              <SportTab
                key={sport}
                sport={sport}
                score={allScores[sport].score}
                active={selectedSport === sport}
                onClick={() => onSelectSport(sport)}
                locale={locale}
              />
            ))}
          </div>
        </div>
      </section>

      {/* §3 — «Quando ir» (a régua de 48 h da S2A substitui este card). */}
      <div id="quando" className="scroll-mt-32 max-w-6xl mx-auto px-4 pt-3">
        <WhenToGoCard
          title={whenToGoTitle}
          rangeLabel={rangeLabel}
          verdict={verdict ?? null}
          hourly={hourly}
          scores={hourlyScores}
          windows={windows}
          locale={locale}
          nowMs={freshnessNowMs ?? undefined}
        />
      </div>
    </>
  );
}
