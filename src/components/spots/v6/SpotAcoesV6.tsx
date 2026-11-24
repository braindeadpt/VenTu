'use client';

/**
 * Acções do spot na página v6 (#184): «Como chegar», favorito, alerta, câmara
 * ao vivo e «Mais» (partilhar). Não estão na maquete (que só tem o
 * veredicto); ficam numa linha própria depois do Porquê e da praia em 3D para
 * a página não perder o que já fazia. Toques ≥ 44 × 44 px.
 */
import { Navigation, Video } from 'lucide-react';
import FavoriteButton from '@/components/FavoriteButton';
import SpotAlertPopover from '@/components/spots/SpotAlertPopover';
import SpotMoreMenu from '@/components/spots/verdict/SpotMoreMenu';
import { getGoogleMapsDirectionsUrl } from '@/lib/mapSpotDetail';
import { temAlertasCondicoes } from '@/lib/desportosV6';
import { getTranslation, pickLocale } from '@/lib/i18n';
import type { SportType } from '@/lib/sportRatings';
import type { Spot } from '@/types';

export default function SpotAcoesV6({
  spot,
  locale,
  sport,
  directionsLabel,
  livecamLabel,
}: {
  spot: Spot;
  locale: string;
  sport: SportType;
  directionsLabel: string;
  livecamLabel?: string;
}) {
  const tv = getTranslation(locale).spotPageVerdict;
  const nome = pickLocale(locale, { pt: spot.name, en: spot.nameEn });
  const regiao = pickLocale(locale, { pt: spot.region, en: spot.regionEn });
  return (
    <div className="acoes" data-testid="spot-acoes">
      <a className="acao primaria" href={getGoogleMapsDirectionsUrl(spot.lat, spot.lon)} target="_blank" rel="noopener noreferrer">
        <Navigation aria-hidden="true" />
        {directionsLabel}
      </a>
      <span className="acao-fav">
        <FavoriteButton spotId={spot.id} spotName={spot.name} size="md" locale={locale} />
      </span>
      {temAlertasCondicoes(sport) ? (
        <span className="acao-alerta">
          <SpotAlertPopover spotId={spot.id} sport={sport} locale={locale} />
        </span>
      ) : null}
      {livecamLabel ? (
        <a className="acao" href="#spot-livecam" aria-label={livecamLabel}>
          <Video aria-hidden="true" />
          <span className="rot">{livecamLabel}</span>
        </a>
      ) : null}
      <span className="acao-mais">
        <SpotMoreMenu
          label={tv.moreLabel}
          menuLabel={tv.moreMenuLabel}
          shareLabel={tv.shareLabel}
          shareTitle={`${nome} — ${regiao}`}
          spotId={spot.id}
          spotName={spot.name}
          locale={locale}
        />
      </span>
    </div>
  );
}
