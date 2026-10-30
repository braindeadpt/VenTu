/**
 * Cartões nº 2 e nº 3 da home v6 (#183): foto do spot (≈ 900 px), véu,
 * crédito com ligações (fora da ligação do cartão: nada de links aninhados),
 * nota em fill, nome numa linha (container query), chip + janela, apoio.
 */
import type { CSSProperties } from 'react';
import FotoCredito from '@/components/v6/FotoCredito';
import LinhaSpot from './LinhaSpot';
import Ondas, { ondasDe } from '@/components/v6/Ondas';
import { fotoVars } from './HomeHero';
import { bandaVars } from '@/lib/v6Tokens';
import type { Linha } from '@/lib/home/homeV6';
import type { FotoSpot } from '@/lib/spotFotos';
import type { HomeV6Copy } from '@/lib/translations/homeV6';

export default function SpotCardV6({
  r,
  l,
  k,
  foto,
  href,
  copy: c,
  locale,
  rk,
  nivelRk,
  tagNivel,
}: {
  r: Linha;
  l: { l1: string; l2: string; pal: string | null; rk: string };
  k: number;
  foto: FotoSpot | null;
  href: string;
  copy: HomeV6Copy;
  locale: string;
  /** #nivel-ui: `rk` do cartão acima do nível («nº N da costa agora»). */
  rk?: string;
  /** #nivel-ui: «· iniciante» no rótulo. */
  nivelRk?: string | null;
  /** #nivel-ui: etiqueta «Spot para intermédios» nos cartões acima do nível escolhido. */
  tagNivel?: { txt: string; lv: Linha['sp']['nivel'] } | null;
}) {
  return (
    <article
      className={`card entra${tagNivel ? ' acima' : ''}`}
      style={{ animationDelay: `${k * 70}ms`, ...(bandaVars(r.b) as CSSProperties) }}
      data-testid="home-cartao"
      data-spot={r.sp.id}
      data-nota={r.n ?? ''}
      data-acima-nivel={tagNivel ? '' : undefined}
    >
      <div className="foto" style={fotoVars(foto)}>
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={foto.srcCard}
            srcSet={`${foto.srcCard} ${foto.wc}w, ${foto.src} ${foto.w}w`}
            sizes="(min-width: 1024px) 26vw, 92vw"
            width={foto.wc}
            height={foto.hc}
            style={{ objectPosition: foto.pos || '50% 50%' }}
            alt={`${r.sp.nome}: ${locale === 'pt' ? foto.altPt : foto.altEn}`}
            loading="lazy"
            decoding="async"
          />
        ) : null}
      </div>
      <div className="veu" aria-hidden="true" />
      <a className="in" href={href}>
        {tagNivel ? (
          <span className="nv-tag" data-testid="cartao-nivel">
            <Ondas n={ondasDe(tagNivel.lv)} />
            {tagNivel.txt}
          </span>
        ) : null}
        <LinhaSpot r={r} l={l} copy={c} rk={rk} nivelRk={nivelRk} />
      </a>
      {foto ? <FotoCredito foto={foto} rotulo={c.foto} /> : null}
    </article>
  );
}
