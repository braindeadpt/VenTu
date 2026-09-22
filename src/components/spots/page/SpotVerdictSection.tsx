'use client';

import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import type { ObservedConditions } from '@/lib/observations';
import type { ObservedWave, ObservedWaveMeta } from '@/lib/observedWave';
import type { ConfidenceDetail, ConfidenceTier } from '@/lib/forecastConfidence';
import type {
  ScoreWaveCorrection,
  ScoreWaveSource,
  ScoreWindCorrection,
  ScoreWindSource,
} from '@/lib/scoreConditions';
import SpotSafetyStrip from '@/components/spots/verdict/SpotSafetyStrip';
import SpotVerdictHero from '@/components/spots/verdict/SpotVerdictHero';
import SpotUnifiedBar from '@/components/spots/verdict/SpotUnifiedBar';
import SpotTimeRail from '@/components/spots/verdict/SpotTimeRail';

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
 *
 * §0 SpotSafetyStrip — SeaStateSafetyBanner + avisos IPMA/costeiro IH, só
 *    com aviso activo, nunca dentro de accordion.
 * §1 SpotVerdictHero (#agora) — «posso ir?»: região·coords, nome, hora
 *    escolhida + Agora/Previsão, score grande em --verdict, banda, porquê,
 *    nível hoje, fonte/confiança → #como-sabemos, acções + menu «Mais».
 * §2 SpotUnifiedBar — uma só barra fixa: tabs modalidade + score + hora +
 *    âncoras (cota --ventu-spot-sticky-top).
 * §3 SpotTimeRail (#quando) — régua de 48 h no eixo de tempo partilhado.
 *
 * Os componentes antigos (SpotDetailHero, SpotStickyBar, linha standalone de
 * tabs, WhenToGoCard) ficam no disco para referência até à limpeza — aqui já
 * não são compostos. As props legadas sem uso no interior novo (verdict,
 * hourly/windows de MagicWindow, observedWave*, rangeLabel) saíram na S3:
 * a régua usa spotWindows sobre o eixo partilhado e o hero lê as ondas
 * observadas de `conditions`. `--verdict` é definido UMA vez no contentor
 * da página (SpotDetailClient) — todas as secções herdam o mesmo acento.
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
  scoreWaveSource?: ScoreWaveSource;
  scoreWaveCorrection?: ScoreWaveCorrection | null;
  /** Tabs de modalidade — lista canónica na barra fixa única. */
  tabSports: SportType[];
  allScores: Record<SportType, SportScore>;
  /** Label da modalidade activa (pill de score da barra). */
  sportLabel: string;
  onSelectSport: (sport: SportType) => void;
  /** aria-label da tablist (tv.sportTabsAria). */
  sportTabsAria: string;
  /** «Quando ir». */
  whenToGoTitle: string;
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
  scoreWaveSource,
  scoreWaveCorrection,
  tabSports,
  allScores,
  sportLabel,
  onSelectSport,
  sportTabsAria,
  whenToGoTitle,
  freshnessNowMs,
}: SpotVerdictSectionProps) {
  return (
    // `contents` não cria caixa: o sticky da SpotUnifiedBar continua contido
    // pelo mesmo ancestral de sempre. O acento --verdict vive no contentor
    // da página (SpotDetailClient) — uma só fonte para todas as secções.
    <div className="contents">
      {/* §0 — Faixa de segurança (só renderiza com aviso de segurança real). */}
      <SpotSafetyStrip spotId={spot.id} locale={locale} />

      {/* §1 — Veredicto «posso ir?» (sem foto no topo). */}
      <SpotVerdictHero
        spot={spot}
        locale={locale}
        backLabel={backLabel}
        directionsLabel={directionsLabel}
        livecamLabel={livecamLabel}
        selectedSport={selectedSport}
        score={score}
        conditions={conditions}
        allScores={allScores}
        scoreWaveSource={scoreWaveSource}
        scoreWaveCorrection={scoreWaveCorrection}
        scoreWindSource={scoreWindSource}
        scoreWindCorrection={scoreWindCorrection}
        freshnessNowMs={freshnessNowMs}
      />

      {/* §2 — Barra fixa única (tabs + score/hora + âncoras). */}
      <SpotUnifiedBar
        locale={locale}
        spotId={spot.id}
        tabSports={tabSports}
        allScores={allScores}
        selectedSport={selectedSport}
        onSelectSport={onSelectSport}
        sportTabsAria={sportTabsAria}
        nowScoreFallback={score.score}
      />

      {/* §3 — «Quando ir»: régua de 48 h no eixo partilhado. */}
      <SpotTimeRail spot={spot} locale={locale} title={whenToGoTitle} />
    </div>
  );
}
