'use client';

import { Compass, Droplets, HelpCircle, MapPin, Navigation } from 'lucide-react';
import type { Spot } from '@/types';
import type { VentuEvent } from '@/types/events';
import type { SpotLocalTips } from '@/lib/spotTips';
import type { SportType } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import { getTranslation } from '@/lib/i18n';
import { getSpotLivecam } from '@/lib/spotLivecams';
import { getSpotWeatherlink } from '@/lib/spotWeatherlink';
import CollapsibleSection from '@/components/ui/CollapsibleSection';
import SpotWebcamSection from '@/components/weather/SpotWebcamSection';
import SpotWeatherlinkSection from '@/components/weather/SpotWeatherlinkSection';
import SpotUpcomingEvents from '@/components/events/SpotUpcomingEvents';
import SpotLogisticsPanel from '@/components/spots/SpotLogisticsPanel';
import { LocalTipsSection } from '@/components/spots/LocalTipsSection';
import { WaterQualityBadge } from '@/components/spots/WaterQualityBadge';
import SpotImage from '@/components/ui/SpotImage';
import SpotNearbyDirectory from '@/components/directory/SpotNearbyDirectory';
import SpotOnSiteWarnings from '@/components/spots/context/SpotOnSiteWarnings';
import SpotNearbySpots from '@/components/spots/context/SpotNearbySpots';
import SpotHowWeKnow, {
  type SpotContextConditions,
} from '@/components/spots/context/SpotHowWeKnow';
import { useSpotTimelineIndex } from '@/components/spots/timeline/useSpotTimeline';

/**
 * Secções 6–7 do contrato (docs/design/SPOT-PAGE.md) — dona: S2C.
 * «No local» (#no-local) · «Chegar e estar» (#chegar) · «Perto daqui»
 * (#perto) em grelha 1→3 colunas; «Como sabemos» (#como-sabemos) em
 * largura total por baixo. Mobile: «No local» aberto, restantes em
 * accordion (CollapsibleSection existente).
 *
 * Props §7 (conditions/score/selectedSport/freshnessNowMs) ligadas pelo
 * SpotDetailClient na S3 — opcionais para a secção degradar sem erros
 * noutros contextos.
 */
export interface SpotContextSectionProps {
  spot: Spot;
  locale: string;
  /** Em mobile os blocos ficam em accordion (CollapsibleSection). */
  isMobile: boolean;
  events: VentuEvent[];
  /** Dicas locais já fundidas (estáticas + overlay da comunidade). */
  mergedLocalTips: SpotLocalTips | null;
  /** URL «Direcções» (Google Maps) resolvido no client. */
  directionsUrl: string;
  copy: {
    warningsRadar: string;
    livecam: string;
    beachStation: string;
    logistics: string;
    location: string;
    aboutSpot: string;
    openGoogleMaps: string;
    openMapsLabel: string;
    region: string;
    level: string;
  };
  /** ——— §7 «Como sabemos» — a S3 liga a partir de spotData ——— */
  selectedSport?: SportType;
  score?: SportScore;
  conditions?: SpotContextConditions;
  freshnessNowMs?: number;
}

const SUB_LABEL =
  'text-meta-sm font-semibold text-fg-subtle uppercase tracking-wide mb-1.5 flex items-center gap-1.5';

export default function SpotContextSection({
  spot,
  locale,
  isMobile,
  events,
  mergedLocalTips,
  directionsUrl,
  copy,
  selectedSport,
  score,
  conditions,
  freshnessNowMs,
}: SpotContextSectionProps) {
  const tc = getTranslation(locale).spotPageContext;
  const { index } = useSpotTimelineIndex();

  const hasLivecam = !!getSpotLivecam(spot.slug);
  const hasStation = !!getSpotWeatherlink(spot.slug);
  const showQuality = !!(
    spot.blueFlag ||
    spot.waterQuality ||
    spot.waterQualityEn ||
    spot.accessibleBeach
  );

  return (
    <section
      aria-label={tc.sectionTitle}
      className="space-y-4"
      data-spot-timeline-index={index}
    >
      {/* §6 v3 — desktop (≥1024): linha A «No local» 8/12 + «Perto daqui»
          4/12; linha B «Chegar e estar» a toda a largura (3 colunas
          internas + faixa de foto de 160 px); linha C «Como sabemos»
          (fora da grelha, largura total). Tablet (768–1023): 2 colunas.
          Mobile (<768): accordions como estavam — a ordem do DOM não
          muda, o reordenamento é só visual via grid placement.
          items-stretch (default) + h-full nos cards = colunas da mesma
          linha com a mesma altura (critério ≤20 %). */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
        <div
          id="no-local"
          role="group"
          aria-label={tc.onSite}
          className="scroll-mt-32 min-w-0 lg:col-span-8"
        >
          {/* Segurança marítima — aberto por defeito também em mobile. */}
          <CollapsibleSection
            title={tc.onSite}
            icon={<MapPin className="w-4 h-4 text-fg-muted shrink-0" aria-hidden />}
            collapsible={isMobile}
            defaultOpen
            className="h-full"
          >
            <div className="space-y-4">
              <div>
                <h3 className={SUB_LABEL}>{copy.warningsRadar}</h3>
                <SpotOnSiteWarnings spotId={spot.id} locale={locale} />
              </div>

              {hasLivecam && (
                <div id="spot-livecam" className="scroll-mt-32">
                  <h3 className={SUB_LABEL}>{copy.livecam}</h3>
                  {/* Coluna de 8/12 no desktop: «stacked» mantém o botão
                      em largura total por baixo do texto. */}
                  <SpotWebcamSection embedded layout="stacked" slug={spot.slug} locale={locale} />
                </div>
              )}

              {hasStation && <SpotWeatherlinkSection embedded slug={spot.slug} locale={locale} />}

              {showQuality && (
                <div>
                  <h3 className={SUB_LABEL}>
                    <Droplets className="w-3.5 h-3.5" aria-hidden />
                    {tc.waterQuality}
                  </h3>
                  <WaterQualityBadge
                    blueFlag={spot.blueFlag}
                    waterQuality={spot.waterQuality}
                    waterQualityEn={spot.waterQualityEn}
                    accessibleBeach={spot.accessibleBeach}
                    locale={locale}
                  />
                </div>
              )}

              {/* Eventos — o componente só renderiza se houver futuros. */}
              <SpotUpcomingEvents embedded spotId={spot.id} locale={locale} events={events} />
            </div>
          </CollapsibleSection>
        </div>

        <div
          id="chegar"
          role="group"
          aria-label={tc.gettingThere}
          className="scroll-mt-32 min-w-0 md:col-span-2 lg:col-span-12"
        >
          <CollapsibleSection
            title={tc.gettingThere}
            icon={<Navigation className="w-4 h-4 text-fg-muted shrink-0" aria-hidden />}
            collapsible={isMobile}
            className="h-full"
          >
            {isMobile ? (
              /* Mobile: exactamente como estava (accordion com o painel
                 completo, dicas e a foto em vídeo por baixo). */
              <div className="space-y-4">
                <div>
                  <h3 className={SUB_LABEL}>{copy.logistics}</h3>
                  <SpotLogisticsPanel
                    embedded
                    spot={spot}
                    locale={locale}
                    locationTitle={copy.location}
                    aboutTitle={copy.aboutSpot}
                    directionsHref={directionsUrl}
                    googleMapsLinkLabel={copy.openGoogleMaps}
                    openMapsLabel={copy.openMapsLabel}
                    regionLabel={copy.region}
                    difficultyLabel={copy.level}
                  />
                </div>
                {/* Facilidades, perigos e dicas — o LocalTipsSection renderiza
                    os três em cards próprios (não duplicar aqui). */}
                <LocalTipsSection spot={spot} tips={mergedLocalTips} locale={locale} />
                {/* SpotImage pequena — aspecto fixo (sem CLS), lazy por
                    omissão (next/image só carrega perto do viewport). */}
                <SpotImage
                  spot={spot}
                  aspect="video"
                  locale={locale}
                  className="rounded-card overflow-hidden"
                />
              </div>
            ) : (
              /* Tablet/desktop (§6 v3): faixa de foto de 160 px no topo,
                 depois 3 colunas internas em lg (2 em md):
                 [mapa mínimo + Direcções + Google Maps] ·
                 [Estacionamento · Comer · Dormir] ·
                 [Maré ideal · Regra local · Perigos · Instalações] ·
                 e o texto «Sobre o spot» em largura total por baixo. */
              <div>
                <div data-context-band>
                  <SpotImage
                    spot={spot}
                    aspect="band"
                    locale={locale}
                    className="rounded-card overflow-hidden"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 mt-4">
                  <div className="min-w-0" data-context-col="map">
                    <SpotLogisticsPanel
                      embedded
                      columns="map"
                      spot={spot}
                      locale={locale}
                      locationTitle={copy.location}
                      aboutTitle={copy.aboutSpot}
                      directionsHref={directionsUrl}
                      googleMapsLinkLabel={copy.openGoogleMaps}
                      openMapsLabel={copy.openMapsLabel}
                      regionLabel={copy.region}
                      difficultyLabel={copy.level}
                    />
                  </div>
                  <div className="min-w-0" data-context-col="stay">
                    <LocalTipsSection
                      group="stay"
                      spot={spot}
                      tips={mergedLocalTips}
                      locale={locale}
                    />
                  </div>
                  <div
                    className="min-w-0 md:col-span-2 lg:col-span-1"
                    data-context-col="conditions"
                  >
                    <LocalTipsSection
                      group="conditions"
                      spot={spot}
                      tips={mergedLocalTips}
                      locale={locale}
                    />
                  </div>
                  <div
                    className="min-w-0 md:col-span-2 lg:col-span-3"
                    data-context-col="about"
                  >
                    <SpotLogisticsPanel
                      embedded
                      columns="about"
                      spot={spot}
                      locale={locale}
                      locationTitle={copy.location}
                      aboutTitle={copy.aboutSpot}
                      directionsHref={directionsUrl}
                      googleMapsLinkLabel={copy.openGoogleMaps}
                      openMapsLabel={copy.openMapsLabel}
                      regionLabel={copy.region}
                      difficultyLabel={copy.level}
                    />
                  </div>
                </div>
              </div>
            )}
          </CollapsibleSection>
        </div>

        <div
          id="perto"
          role="group"
          aria-label={tc.nearby}
          className="scroll-mt-32 min-w-0 md:col-start-2 md:row-start-1 lg:col-start-9 lg:col-span-4 lg:row-start-1"
        >
          <CollapsibleSection
            title={tc.nearby}
            icon={<Compass className="w-4 h-4 text-fg-muted shrink-0" aria-hidden />}
            collapsible={isMobile}
            className="h-full"
          >
            <div className="space-y-4">
              <div>
                <h3 className={SUB_LABEL}>{tc.nearbySpots}</h3>
                <SpotNearbySpots spot={spot} locale={locale} selectedSport={selectedSport} />
              </div>
              {/* Diretório (escolas/serviços) — mantém o destino do
                  componente existente por baixo da lista de spots. */}
              <SpotNearbyDirectory
                embedded
                spotId={spot.id}
                spotLat={spot.lat}
                spotLon={spot.lon}
                locale={locale}
              />
            </div>
          </CollapsibleSection>
        </div>
      </div>

      {/* §7 — Como sabemos: proveniência, confiança, coerência, feedback. */}
      <div
        id="como-sabemos"
        role="group"
        aria-label={tc.howWeKnow}
        className="scroll-mt-32"
      >
        <CollapsibleSection
          title={tc.howWeKnow}
          icon={<HelpCircle className="w-4 h-4 text-fg-muted shrink-0" aria-hidden />}
          collapsible={isMobile}
        >
          <SpotHowWeKnow
            spot={spot}
            locale={locale}
            conditions={conditions}
            score={score}
            selectedSport={selectedSport}
            freshnessNowMs={freshnessNowMs}
          />
        </CollapsibleSection>
      </div>
    </section>
  );
}
