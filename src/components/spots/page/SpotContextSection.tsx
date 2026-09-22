'use client';

import { AlertTriangle, Gauge, MapPin, Video } from 'lucide-react';
import type { Spot } from '@/types';
import type { VentuEvent } from '@/types/events';
import type { SpotLocalTips } from '@/lib/spotTips';
import { getTranslation } from '@/lib/i18n';
import { getSpotLivecam } from '@/lib/spotLivecams';
import { getSpotWeatherlink } from '@/lib/spotWeatherlink';
import CollapsibleSection from '@/components/ui/CollapsibleSection';
import SpotWarningsSection from '@/components/spots/SpotWarningsSection';
import SpotWebcamSection from '@/components/weather/SpotWebcamSection';
import SpotWeatherlinkSection from '@/components/weather/SpotWeatherlinkSection';
import SpotUpcomingEvents from '@/components/events/SpotUpcomingEvents';
import SpotLogisticsPanel from '@/components/spots/SpotLogisticsPanel';
import { LocalTipsSection } from '@/components/spots/LocalTipsSection';
import SpotNearbyDirectory from '@/components/directory/SpotNearbyDirectory';
import FeedbackForm from '@/components/FeedbackForm';

/**
 * Secções 6–7 do contrato (docs/design/SPOT-PAGE.md) — dona: S2C.
 * «No local» (#no-local) · «Chegar e estar» (#chegar) · «Perto daqui»
 * (#perto) em grelha 1→3 colunas, e «Como sabemos» (#como-sabemos) com o
 * feedback. Por agora renderiza os componentes existentes com as mesmas
 * props; a S2C redesenha o interior.
 */
export interface SpotContextSectionProps {
  spot: Spot;
  locale: string;
  /** Em mobile os blocos mantêm o comportamento accordion actual. */
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
}

export default function SpotContextSection({
  spot,
  locale,
  isMobile,
  events,
  mergedLocalTips,
  directionsUrl,
  copy,
}: SpotContextSectionProps) {
  const tc = getTranslation(locale).spotPageContext;

  return (
    <>
      {/* §6 — contexto: 1 coluna em mobile, 3 em lg. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div
          id="no-local"
          role="group"
          aria-label={tc.onSite}
          className="space-y-4 scroll-mt-32 min-w-0"
        >
          {/* Segurança marítima — aberto por defeito também em mobile. */}
          <CollapsibleSection
            title={copy.warningsRadar}
            icon={<AlertTriangle className="w-4 h-4 text-score-poor shrink-0" aria-hidden />}
            collapsible={isMobile}
            defaultOpen
          >
            <SpotWarningsSection embedded spotId={spot.id} locale={locale} />
          </CollapsibleSection>

          {getSpotLivecam(spot.slug) && (
            <CollapsibleSection
              anchorId="spot-livecam"
              title={copy.livecam}
              icon={<Video className="w-4 h-4 text-fg-muted shrink-0" aria-hidden />}
              collapsible={isMobile}
            >
              <SpotWebcamSection embedded slug={spot.slug} locale={locale} />
            </CollapsibleSection>
          )}

          {getSpotWeatherlink(spot.slug) && (
            <CollapsibleSection
              title={copy.beachStation}
              icon={<Gauge className="w-4 h-4 text-fg-muted shrink-0" aria-hidden />}
              collapsible={isMobile}
            >
              <SpotWeatherlinkSection embedded slug={spot.slug} locale={locale} />
            </CollapsibleSection>
          )}

          <SpotUpcomingEvents embedded spotId={spot.id} locale={locale} events={events} />
        </div>

        <div
          id="chegar"
          role="group"
          aria-label={tc.gettingThere}
          className="space-y-4 scroll-mt-32 min-w-0"
        >
          <CollapsibleSection
            title={copy.logistics}
            icon={<MapPin className="w-4 h-4 text-fg-muted shrink-0" aria-hidden />}
            collapsible={isMobile}
          >
            <div className="space-y-4">
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
              <LocalTipsSection spot={spot} tips={mergedLocalTips} locale={locale} />
            </div>
          </CollapsibleSection>
        </div>

        <div
          id="perto"
          role="group"
          aria-label={tc.nearby}
          className="space-y-4 scroll-mt-32 min-w-0"
        >
          <CollapsibleSection
            title={tc.nearby}
            icon={<MapPin className="w-4 h-4 text-fg-muted shrink-0" aria-hidden />}
            collapsible={isMobile}
          >
            <SpotNearbyDirectory
              embedded
              spotId={spot.id}
              spotLat={spot.lat}
              spotLon={spot.lon}
              locale={locale}
            />
          </CollapsibleSection>
        </div>
      </div>

      {/* §7 — Como sabemos: por agora só o feedback; a S2C traz a
          proveniência completa para aqui. */}
      <div
        id="como-sabemos"
        role="group"
        aria-label={tc.howWeKnow}
        className="border-t border-divider pt-3 px-1 scroll-mt-32"
      >
        <FeedbackForm locale={locale} defaultSpotSlug={spot.slug} />
      </div>
    </>
  );
}
