/** Conteúdo do nº 1 (cartão do líder) e dos cartões nº 2 e nº 3 (#183): nota em fill, «nº k agora», nome + concelho, chip + janela, apoio. */
import type { CSSProperties } from 'react';
import Frase from './Frase';
import { bandaVars } from '@/lib/v6Tokens';
import type { Linha } from '@/lib/home/homeV6';
import type { HomeV6Copy } from '@/lib/translations/homeV6';

/** número e unidade nunca se separam na quebra de linha («8 nós», «12 s», «1,5 m») */
const colaUnidade = (t: string) => t.replace(/(\d) (nós|kt|s|m)(?=[\s,.·<]|$)/g, '$1\u00a0$2');

export default function LinhaSpot({ r, l, copy: c, seta }: { r: Linha; l: { l1: string; l2: string; pal: string | null; rk: string }; copy: HomeV6Copy; seta?: boolean }) {
  const sub = r.sp.concelho === r.sp.nome || r.sp.concelho === r.sp.curto ? c.zonaNome(r.sp.zona) : r.sp.concelho;
  return (
    <>
      <span className="nota" style={bandaVars(r.b) as CSSProperties} aria-hidden="true" data-nota={r.n ?? ''} data-banda={r.b}>
        {r.n ?? '–'}
      </span>
      <span>
        <span className="rk">{l.rk}</span>
        <span className="nm">
          {r.sp.curto || r.sp.nome}
          <span>{sub}</span>
        </span>
        <span className="l1">
          <Frase txt={l.l1} banda={r.b} pal={l.pal} />
          {r.n != null ? <span className="sr">{c.notaSr(r.n)}</span> : null}
        </span>
        <span className="l2">
          <Frase txt={colaUnidade(l.l2)} banda={r.b} />
        </span>
      </span>
      {seta ? (
        <svg className="seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      ) : null}
    </>
  );
}
