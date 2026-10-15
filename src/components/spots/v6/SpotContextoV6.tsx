'use client';

/**
 * O que a página de spot v6 não tinha e o antigo SpotContextSection trazia
 * (#184, retirada dos duplicados): avisos e radar, câmara ao vivo, estação na
 * praia, «Chegar e estar» (sobre o spot, região e nível, localização, dicas
 * locais) e eventos. Fica logo a seguir ao «Estudar o spot», no estilo v6.
 *
 * Regra de ouro: nenhum número da hora aparece aqui (vento, onda e maré vivem
 * no Porquê e na tabela do «Estudar o spot»). Também não se repete o que a v6
 * já mostra: «Como chegar» (acções), praia em 3D (mapa), melhor maré e
 * atenção («Estudar o spot»), faixa de segurança (perigos à navegação).
 */
import { CalendarDays, ExternalLink, Gauge, MapPin, Navigation, Video } from 'lucide-react';
import Link from 'next/link';
import type { Spot } from '@/types';
import type { VentuEvent } from '@/types/events';
import type { SpotLocalTips } from '@/lib/spotTips';
import { getTranslation } from '@/lib/i18n';
import { getSpotLivecam } from '@/lib/spotLivecams';
import { getSpotWeatherlink, getWeatherlinkEmbedUrl, getWeatherlinkPageUrl } from '@/lib/spotWeatherlink';
import { getDifficultyLabel } from '@/lib/mapDifficulty';
import { getNearAccommodationUrl } from '@/lib/accommodation';
import { spotTagEn } from '@/lib/spotTagsEn';
import { eventsForSpot } from '@/lib/events';
import EventCard from '@/components/events/EventCard';
import SpotStormAlert from '@/components/spots/context/SpotStormAlert';
import SpotRadarEcho from '@/components/spots/context/SpotRadarEcho';
import SpotOnSiteWarnings from '@/components/spots/context/SpotOnSiteWarnings';

export interface SpotContextoV6Props {
  spot: Spot;
  locale: string;
  events: readonly VentuEvent[];
  /** Dicas locais já fundidas (estáticas + overlay da comunidade). */
  dicas: SpotLocalTips | null;
}

function temTexto(v: string | undefined | null): v is string {
  if (!v) return false;
  const t = v.trim();
  return t.length > 0 && t !== '—' && t !== '-';
}

export default function SpotContextoV6({ spot, locale, events, dicas }: SpotContextoV6Props) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale);
  const td = t.spotDetail;
  const tc = t.spotPageContext;
  const tl = t.localTips;

  const cam = getSpotLivecam(spot.slug);
  const camTitulo = cam ? (isPt ? cam.labelPt : cam.labelEn) : '';
  const camEmbed =
    cam?.kind === 'youtube' && cam.youtubeId
      ? `https://www.youtube-nocookie.com/embed/${cam.youtubeId}?rel=0&playsinline=1`
      : cam?.kind === 'surfline' && cam.embedUrl
        ? cam.embedUrl
        : null;
  const camFonte = !cam
    ? ''
    : cam.kind === 'youtube' && cam.youtubeId
      ? t.layout.livecamYoutube
      : cam.kind === 'surfline' && cam.embedUrl
        ? t.layout.livecamSurfline
        : t.layout.livecamGeneric.replace('{provider}', cam.provider);

  const est = getSpotWeatherlink(spot.slug);
  const estTitulo = est ? (isPt ? est.labelPt : est.labelEn) : '';

  // Dicas locais: a melhor maré e os perigos já estão no «Estudar o spot»
  // (melhorMare / atencao): aqui só o que lá não está.
  const estacionar = isPt
    ? dicas?.parking || spot.localTips?.parking
    : dicas?.parkingEn || dicas?.parking || spot.localTips?.parkingEn;
  const comer = isPt ? dicas?.food || spot.localTips?.food : dicas?.foodEn || dicas?.food || spot.localTips?.foodEn;
  const dormir = isPt
    ? dicas?.accommodation ?? spot.localTips?.accommodation
    : dicas?.accommodationEn ?? dicas?.accommodation ?? spot.localTips?.accommodationEn ?? spot.localTips?.accommodation;
  const regra = isPt
    ? dicas?.localRule ?? spot.localTips?.localRule
    : dicas?.localRuleEn ?? dicas?.localRule ?? spot.localTips?.localRuleEn;
  const instalacoes = spot.facilities?.length ? spot.facilities.map((f) => (isPt ? f : spotTagEn(f))).join(' · ') : null;

  const regiao = isPt ? spot.region : spot.regionEn;
  const sobre = isPt ? spot.description : spot.descriptionEn;
  const mapaUrl = `/${locale}/mapa/?lat=${spot.lat}&lon=${spot.lon}`;
  const proximos = eventsForSpot([...events], spot.id);

  return (
    <section className="ctx" aria-label={tc.sectionTitle} data-testid="spot-contexto">
      <div className="ctx-grelha">
        <div className="ctx-bloco" id="no-local" role="group" aria-labelledby="no-local-t">
          <h2 className="ctx-t" id="no-local-t">
            <MapPin aria-hidden="true" />
            {tc.onSite}
          </h2>

          <div className="ctx-item" data-ctx="avisos">
            <h3 className="ctx-rot">{td.warningsRadar}</h3>
            {/* Ciclone (cone NHC sobre o spot), eco do radar IPMA medido e os avisos
                IPMA/IH informativos: os perigos à navegação ficam na faixa de segurança. */}
            <SpotStormAlert spotId={spot.id} locale={locale} />
            <SpotRadarEcho spotId={spot.id} locale={locale} />
            <SpotOnSiteWarnings spotId={spot.id} locale={locale} />
          </div>

          {cam ? (
            <div className="ctx-item" id="spot-livecam" data-ctx="livecam">
              <h3 className="ctx-rot">{td.livecam}</h3>
              {camEmbed ? (
                <div className="ctx-video">
                  <iframe
                    src={camEmbed}
                    title={camTitulo}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                    loading="lazy"
                  />
                </div>
              ) : null}
              <p className="ctx-nome">
                <Video aria-hidden="true" />
                {camTitulo}
              </p>
              <p className="ctx-nota">{camFonte}</p>
              <div className="ctx-links">
                <a className="acao" href={cam.url} target="_blank" rel="noopener noreferrer">
                  {t.livecams.watchLive}
                  <ExternalLink aria-hidden="true" />
                </a>
                <Link className="ctx-link" href={`/${locale}/livecams/`}>
                  {t.layout.weatherLivecamsBrowse}
                </Link>
              </div>
            </div>
          ) : null}

          {est ? (
            <div className="ctx-item" data-ctx="estacao">
              <h3 className="ctx-rot">{td.beachStation}</h3>
              <p className="ctx-nome">
                <Gauge aria-hidden="true" />
                {estTitulo}
                <small>WeatherLink · Davis Vantage Vue</small>
              </p>
              <p className="ctx-nota">{t.layout.weatherlinkDesc}</p>
              <div className="ctx-estacao">
                <iframe
                  src={getWeatherlinkEmbedUrl(est.pageId)}
                  title={t.layout.weatherlinkIframe.replace('{title}', estTitulo)}
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
              <div className="ctx-links">
                <a className="acao" href={getWeatherlinkPageUrl(est.pageId)} target="_blank" rel="noopener noreferrer">
                  {t.layout.weatherLinkOpen}
                  <ExternalLink aria-hidden="true" />
                </a>
              </div>
            </div>
          ) : null}
        </div>

        <div className="ctx-bloco" id="chegar" role="group" aria-labelledby="chegar-t">
          <h2 className="ctx-t" id="chegar-t">
            <Navigation aria-hidden="true" />
            {tc.gettingThere}
          </h2>
          <div className="ctx-item" data-ctx="sobre">
            <h3 className="ctx-rot">{td.aboutSpot}</h3>
            {sobre ? <p className="ctx-sobre">{sobre}</p> : null}
          </div>
          <dl className="praia ctx-dl" data-ctx="logistica">
            <dt>{t.spots.region}</dt>
            <dd className="cap">{regiao}</dd>
            <dt>{t.spots.level}</dt>
            <dd>{getDifficultyLabel(spot.difficulty, locale)}</dd>
            <dt>{td.location}</dt>
            <dd>
              <span className="num">
                {spot.lat.toFixed(4)}, {spot.lon.toFixed(4)}
              </span>{' '}
              · <a className="ctx-link" href={mapaUrl}>{td.openMapsLabel}</a>
            </dd>
            {temTexto(estacionar) ? (
              <>
                <dt>{tl.parking}</dt>
                <dd data-dica="parking">{estacionar}</dd>
              </>
            ) : null}
            {temTexto(comer) ? (
              <>
                <dt>{tl.food}</dt>
                <dd data-dica="food">{comer}</dd>
              </>
            ) : null}
            <dt>{tl.stay}</dt>
            <dd data-dica="sleep">
              {temTexto(dormir) ? (
                dormir
              ) : (
                <a className="ctx-link" href={getNearAccommodationUrl(spot.lat, spot.lon)} target="_blank" rel="noopener noreferrer">
                  {tl.findNearbyStays}
                </a>
              )}
            </dd>
            {temTexto(regra) ? (
              <>
                <dt>{tl.localRule}</dt>
                <dd data-dica="rule">{regra}</dd>
              </>
            ) : null}
            {instalacoes ? (
              <>
                <dt>{tl.facilities}</dt>
                <dd data-dica="facilities">{instalacoes}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>

      {proximos.length ? (
        <div className="ctx-bloco ctx-eventos" role="group" aria-labelledby="spot-upcoming-events">
          <h2 className="ctx-t" id="spot-upcoming-events">
            <CalendarDays aria-hidden="true" />
            {t.news.eventsHeading}
          </h2>
          <ul>
            {proximos.map((e) => (
              <li key={e.id}>
                <EventCard event={e} locale={locale} compact />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
