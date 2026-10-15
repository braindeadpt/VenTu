/**
 * Hero da home v6 (#183): selector Kite · Surf no canto superior direito (o cabeçalho do
 * site fica por cima e tem o logótipo; ver docs/pr-183/cabecalho.md), foto do nº 1 do ranking na modalidade escolhida
 * (crédito em pílula), data, palavra gigante («VAI.», «Dá.», «Não vai.»,
 * «Noite.») na cor da banda do nº 1, frase nacional e o cartão do nº 1
 * (`LiderCard`). Palavra e frase saem no HTML estático (LCP).
 */
import type { CSSProperties } from 'react';
import FotoCredito from '@/components/v6/FotoCredito';
import ModalidadeToggle from '@/components/v6/ModalidadeToggle';
import type { Modalidade } from '@/lib/modalidades';
import Frase from './Frase';
import LinhaSpot from './LinhaSpot';
import { bandaVars } from '@/lib/v6Tokens';
import type { EstadoHome } from '@/lib/home/estadoHome';
import type { SpotHome } from '@/lib/home/homeV6';
import type { FotoSpot } from '@/lib/spotFotos';
import type { HomeV6Copy } from '@/lib/translations/homeV6';

export function fotoVars(f: FotoSpot | null): CSSProperties {
  if (!f) return {};
  return {
    ['--up' as string]: String(f.up ?? 0),
    ['--fl' as string]: `${f.fl ?? 0}%`,
    ['--pd' as string]: f.posd || f.pos || '50% 50%',
  };
}

export default function HomeHero({
  E,
  copy: c,
  foto,
  locale,
  hrefSpot,
  d,
  onModalidade,
}: {
  E: EstadoHome;
  copy: HomeV6Copy;
  foto: FotoSpot | null;
  locale: string;
  hrefSpot: (sp: SpotHome, i: number) => string;
  d: Modalidade;
  onModalidade: (d: Modalidade) => void;
}) {
  const top = E.top[0];
  const l = E.linhas[0];
  const pal = c.veredito[E.palavra];
  const alt = foto && top ? `${top.sp.nome}: ${locale === 'pt' ? foto.altPt : foto.altEn}` : '';
  return (
    <section className="hero" aria-label={c.heroAria} data-testid="home-hero">
      <div className={`foto kb${foto && (foto.up ?? 0) < 0 ? ' desce' : ''}${foto && (foto.fl ?? 0) > 0 ? ' lado' : ''}`} style={fotoVars(foto)}>
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={foto.src}
            src={foto.src}
            srcSet={`${foto.srcCard} ${foto.wc}w, ${foto.src} ${foto.w}w`}
            sizes="(min-width: 1024px) 52vw, 100vw"
            width={foto.w}
            height={foto.h}
            alt={alt}
            decoding="async"
            fetchPriority="high"
            style={{ objectPosition: foto.pos || undefined }}
            data-testid="home-hero-foto"
            data-spot={top?.sp.id}
          />
        ) : null}
      </div>
      <div className="veu" aria-hidden="true" />
      <div className="hero-modo" data-testid="home-modo">
        <ModalidadeToggle valor={d} onChange={onModalidade} rotulos={c.modalidades} ariaLabel={c.modalidadeAria} />
      </div>
      <div className="hero-in">
        <p className="quando" data-testid="home-quando">
          {E.quando.dia} · <b>{E.quando.forte}</b> · {E.quando.resto}
        </p>
        <p className="gng" data-testid="home-palavra" data-palavra={E.palavra} aria-live="polite">
          {pal}
          {E.noite ? <small>{c.noiteSub}</small> : null}
          <span className="sr">: {c.banda[E.frase.b]}</span>
        </p>
        <p className="nac" data-testid="home-frase">
          <Frase txt={E.frase.txt} banda={E.frase.b} />
        </p>
        {top && l ? (
          <a
            className="lider"
            href={hrefSpot(top.sp, top.i)}
            style={bandaVars(top.b) as CSSProperties}
            data-testid="home-lider"
            data-spot={top.sp.id}
            data-nota={top.n ?? ''}
          >
            <LinhaSpot r={top} l={l} copy={c} seta />
          </a>
        ) : null}
      </div>
      <div className="swell" aria-hidden="true">
        <svg viewBox="0 0 1200 26" preserveAspectRatio="none">
          <path d="M0 14 Q75 2 150 14 T300 14 T450 14 T600 14 T750 14 T900 14 T1050 14 T1200 14 V26 H0Z" fill="currentColor" />
        </svg>
        <svg className="b" viewBox="0 0 1200 26" preserveAspectRatio="none">
          <path d="M0 18 Q50 8 100 18 T200 18 T300 18 T400 18 T500 18 T600 18 T700 18 T800 18 T900 18 T1000 18 T1100 18 T1200 18 V26 H0Z" fill="currentColor" />
        </svg>
      </div>
      {foto ? <FotoCredito foto={foto} rotulo={c.foto} className="hero-cred" /> : null}
    </section>
  );
}
