/**
 * Hero do spot v6 (#184): foto a toda a largura com crédito, nome (h1), linha
 * «CASCAIS · QUA 14 OUT · 14H · AGORA», a Nota no fill da banda, a palavra da
 * banda, a frase curta e a linha de apoio. Lê só o objecto da hora.
 */
import type { CSSProperties } from 'react';
import Nota from '@/components/v6/Nota';
import FotoCredito from '@/components/v6/FotoCredito';
import type { FotoSpot } from '@/lib/spotFotos';
import type { BandaK } from '@/lib/modalidades';
import type { Parte } from '@/lib/spotVeredicto';
import type { SpotPageV6Copy } from '@/lib/translations/spotPage/v6';

export interface SpotHeroProps {
  nome: string;
  quando: { local: string; dia: string; hora: string; agora: boolean };
  n: number | null;
  banda: BandaK;
  palavra: string;
  resto: string;
  apoio: Parte[];
  foto: FotoSpot | null;
  locale: string;
  copy: SpotPageV6Copy;
  faltaTxt?: string | null;
  /** Hora sem o dado da fonte (vento/onda): «–» e «Sem dados», não a lua. */
  semDados?: boolean;
}

export default function SpotHero({ nome, quando, n, banda, palavra, resto, apoio, foto, locale, copy, faltaTxt, semDados }: SpotHeroProps) {
  const fotoStyle = foto
    ? ({ '--up': foto.up ?? 0, '--fl': `${foto.fl ?? 0}%`, '--pd': foto.posd || foto.pos || '50% 50%' } as CSSProperties)
    : undefined;
  const cls = ['foto', 'kb', foto && (foto.up ?? 0) < 0 ? 'desce' : '', foto && (foto.fl ?? 0) > 0 ? 'lado' : ''].filter(Boolean).join(' ');
  const ariaNota =
    n == null ? (semDados ? copy.semDadosAria : copy.noiteAria) : copy.notaAria.replace('{n}', String(n)).replace('{banda}', palavra);
  return (
    <section className="hero" aria-labelledby="spot-n" id="agora">
      <div className={cls} style={fotoStyle} data-testid="spot-hero-foto">
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={foto.src}
            srcSet={`${foto.srcCard} ${foto.wc}w, ${foto.src} ${foto.w}w`}
            sizes="100vw"
            width={foto.w}
            height={foto.h}
            alt={locale === 'pt' ? foto.altPt : foto.altEn}
            decoding="async"
            fetchPriority="high"
            style={{ objectPosition: foto.pos }}
          />
        ) : null}
      </div>
      <div className="veu" aria-hidden="true" />
      <div className="hero-in">
        <h1 className={`spot-n${nome.length > 14 ? ' longo' : ''}`} id="spot-n">
          {nome}
        </h1>
        <p className="quando" data-testid="spot-quando">
          {quando.local} · {quando.dia} · <b>{quando.hora}</b>
          {quando.agora ? ` · ${copy.agora}` : ''}
        </p>
        <div className="ver" aria-live="polite" aria-atomic="true" data-testid="spot-veredicto" data-banda={banda}>
          <Nota n={n} ariaLabel={ariaNota} semDados={semDados} />
          <p style={{ margin: 0 }}>
            <span className="pal">{palavra}</span>
            <span className="l1">{resto}</span>
          </p>
        </div>
        <p className="l2" data-testid="spot-apoio">
          {apoio.map((p, k) => (p.b ? <b key={k}>{p.t}</b> : <span key={k}>{p.t}</span>))}
        </p>
        {faltaTxt ? <p className="falta">{faltaTxt}</p> : null}
      </div>
      <div className="swell" aria-hidden="true">
        <svg viewBox="0 0 1200 26" preserveAspectRatio="none">
          <path d="M0 14 Q75 2 150 14 T300 14 T450 14 T600 14 T750 14 T900 14 T1050 14 T1200 14 V26 H0Z" fill="currentColor" />
        </svg>
        <svg className="b" viewBox="0 0 1200 26" preserveAspectRatio="none">
          <path d="M0 18 Q50 8 100 18 T200 18 T300 18 T400 18 T500 18 T600 18 T700 18 T800 18 T900 18 T1000 18 T1100 18 T1200 18 V26 H0Z" fill="currentColor" />
        </svg>
      </div>
      {foto ? <FotoCredito foto={foto} rotulo={copy.foto} /> : null}
    </section>
  );
}
