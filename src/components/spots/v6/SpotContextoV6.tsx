'use client';

/**
 * O que a página de spot v6 não tinha e o antigo SpotContextSection trazia
 * (#184, retirada dos duplicados): avisos e radar, câmara ao vivo, estação na
 * praia, qualidade da água, «Chegar e estar» (sobre o spot, região e nível,
 * localização, dicas locais), «Perto daqui» (vizinhos e diretório) e eventos.
 * Fica logo a seguir ao «Estudar o spot», em markup e estilo v6 nativos.
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
import { getDifficultyLabel, nivelDoSpot } from '@/lib/mapDifficulty';
import { getNearAccommodationUrl } from '@/lib/accommodation';
import { spotTagEn } from '@/lib/spotTagsEn';
import { eventsForSpot } from '@/lib/events';
import { safeExternalUrl } from '@/lib/safeUrl';
import { waterQualityInSeason, type WaterQualityLive } from '@/lib/waterQuality';
import type { SportType } from '@/lib/sportRatings';
import { spotV6Copy, type SpotPageV6Copy } from '@/lib/translations/spotPage/v6';
import AvisosV6 from './AvisosV6';
import PertoV6 from './PertoV6';

export interface SpotContextoV6Props {
  spot: Spot;
  locale: string;
  events: readonly VentuEvent[];
  /** Dicas locais já fundidas (estáticas + overlay da comunidade). */
  dicas: SpotLocalTips | null;
  /** Registo APA InfoÁgua vivo (conditions.waterQuality), só spots ≤3 km de uma água balnear. */
  aguaViva?: WaterQualityLive;
  /** Hora escolhida na régua (para as notas dos vizinhos) e modalidade da página. */
  t?: string;
  sport: SportType;
}

/** Qualidade da água balnear (APA InfoÁgua / Bandeira Azul / ficha do spot), em chips v6. */
function Agua({ spot, locale, viva }: { spot: Spot; locale: string; viva?: WaterQualityLive }) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale).spotPageContext;
  const classes: Record<number, string> = { 1: t.wqClassExcellent, 2: t.wqClassGood, 3: t.wqClassSufficient, 4: t.wqClassPoor };
  const ficha: Record<string, string> = {
    excelente: 'Excelente', boa: 'Boa', razoavel: 'Razoável', 'má': 'Má',
    excellent: 'Excellent', good: 'Good', fair: 'Fair', poor: 'Poor',
  };
  const classe = viva?.annualClass ? classes[viva.annualClass] : null;
  const q = isPt ? spot.waterQuality : spot.waterQualityEn;
  const qTxt = !classe && q ? ficha[q] : null;
  const epoca = viva ? waterQualityInSeason(viva, Date.now()) : false;
  const conselho = epoca && viva && (viva.advice === 1 || viva.advice === 2) ? viva.advice : null;
  const bandeira = viva?.blueFlag || (!viva && spot.blueFlag);
  const acessivel = spot.accessibleBeach || viva?.accessible;
  if (!bandeira && !classe && !qTxt && conselho == null && !(epoca && viva?.advice === 0) && !viva?.alerts?.length && !acessivel && !viva) return null;
  const km = new Intl.NumberFormat(isPt ? 'pt-PT' : 'en-GB', { maximumFractionDigits: 1 });
  const dia = new Intl.DateTimeFormat(isPt ? 'pt-PT' : 'en-GB', { day: 'numeric', month: 'short' });
  return (
    <div className="ctx-item" data-ctx="agua">
      <h3 className="ctx-rot">{t.waterQuality}</h3>
      <p className="ec-chips">
        {bandeira ? <span className="ec-chip bom">{viva?.blueFlag ? t.wqBlueFlag : t.wqBlueFlag2024}</span> : null}
        {classe ? <span className="ec-chip bom">{t.wqApaClass.replace('{cls}', classe)}</span> : null}
        {qTxt ? (
          <span className={`ec-chip ${q === 'má' || q === 'poor' ? 'nao' : q === 'razoavel' || q === 'fair' ? 'da' : 'bom'}`}>
            {t.wqQualityPrefix}
            {qTxt}
          </span>
        ) : null}
        {conselho != null && viva ? (
          <span className={`ec-chip ${conselho === 2 ? 'nao' : 'bom'}`} title={viva.motive ?? undefined} data-water-advice={conselho}>
            {conselho === 2 ? t.wqAdviceBad : t.wqAdviceGood}
          </span>
        ) : null}
        {epoca && viva?.advice === 0 ? (
          <span className="ec-chip" data-water-advice="0">
            {t.wqAdviceNone}
          </span>
        ) : null}
        {viva?.alerts?.map((a, i) => (
          <span key={i} className="ec-chip da" title={[isPt ? a.advicePt : a.adviceEn, a.date].filter(Boolean).join(' · ') || undefined} data-water-alert="true">
            {isPt ? a.namePt : a.nameEn}
          </span>
        ))}
        {acessivel ? <span className="ec-chip">{t.wqAccessible}</span> : null}
      </p>
      {viva ? (
        <p className="ctx-nota" data-water-quality-meta="true">
          {viva.distKm != null && viva.distKm > 0.5
            ? t.wqBeachLine.replace('{name}', viva.beach).replace('{km}', km.format(viva.distKm))
            : t.wqBeachNear.replace('{name}', viva.beach)}
          {viva.lastSampleAt ? ` · ${t.wqLastSample.replace('{date}', dia.format(viva.lastSampleAt))}` : ''}
          {` · ${t.wqSource}`}
        </p>
      ) : null}
    </div>
  );
}

function dataEvento(iso: string, locale: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale === 'pt' ? 'pt-PT' : 'en-GB', { ...o, timeZone: 'UTC' }).format(dt);
  return { dia: f({ day: '2-digit' }), mes: f({ month: 'short' }).replace('.', '') };
}

function Eventos({ lista, locale, c }: { lista: readonly VentuEvent[]; locale: string; c: SpotPageV6Copy }) {
  const t = getTranslation(locale);
  const isPt = locale === 'pt';
  return (
    <div className="ctx-bloco ctx-eventos" role="group" aria-labelledby="spot-upcoming-events">
      <h2 className="ctx-t" id="spot-upcoming-events">
        <CalendarDays aria-hidden="true" />
        {t.news.eventsHeading}
      </h2>
      <ul>
        {lista.map((e) => {
          const ini = dataEvento(e.startDate, locale);
          const fim = e.endDate && e.endDate !== e.startDate ? dataEvento(e.endDate, locale) : null;
          const href = e.url ? safeExternalUrl(e.url) : null;
          return (
            <li key={e.id} className="ev" data-event={e.id}>
              <p className="ev-data" aria-hidden="true">
                <b className="num">{ini.dia}</b>
                <span>{ini.mes}</span>
              </p>
              <div className="ev-corpo">
                <p className="ev-meta">
                  <span className="ec-chip">{e.sport}</span>
                  <span>
                    {fim ? `${ini.dia}–${fim.dia} ${fim.mes}` : `${ini.dia} ${ini.mes}`}
                  </span>
                  {e.free === true ? <span>{c.eventoGratis}</span> : null}
                </p>
                <h3 className="ev-t">{isPt ? e.title : e.titleEn}</h3>
                <p className="ctx-nota">{e.location}</p>
                {href ? (
                  <a className="ctx-link" href={href} target="_blank" rel="noopener noreferrer">
                    {t.news.eventRegister}
                    <ExternalLink aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function temTexto(v: string | undefined | null): v is string {
  if (!v) return false;
  const t = v.trim();
  return t.length > 0 && t !== '—' && t !== '-';
}

export default function SpotContextoV6({ spot, locale, events, dicas, aguaViva, t: hora, sport }: SpotContextoV6Props) {
  const c6 = spotV6Copy(locale);
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
            <AvisosV6 spotId={spot.id} locale={locale} />
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
            <dd>{getDifficultyLabel(nivelDoSpot(spot, sport), locale)}</dd>
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
          {/* Bandeira Azul e classificação APA: são da praia, como as instalações */}
          <Agua spot={spot} locale={locale} viva={aguaViva} />
        </div>
      </div>

      <PertoV6 spot={spot} locale={locale} copy={c6} t={hora} sport={sport} />

      {proximos.length ? <Eventos lista={proximos} locale={locale} c={c6} /> : null}
    </section>
  );
}
