/**
 * Hero da home v6 (#183): selector Kite · Surf no canto superior direito (o cabeçalho do
 * site fica por cima e tem o logótipo; ver docs/pr-183/cabecalho.md), foto do nº 1 do ranking na modalidade escolhida
 * (crédito em pílula), data, palavra gigante («VAI.», «Dá.», «Não vai.»,
 * «Noite.») na cor da banda do nº 1, frase nacional e o cartão do nº 1
 * (`LiderCard`). Palavra e frase saem no HTML estático (LCP).
 */
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import FotoCredito from '@/components/v6/FotoCredito';
import ModalidadeToggle from '@/components/v6/ModalidadeToggle';
import NivelControl from '@/components/v6/NivelControl';
import Ondas, { ondasDe } from '@/components/v6/Ondas';
import type { MapDifficultyFilter, NivelUtilizador } from '@/lib/mapDifficulty';
import type { NivelCopy } from '@/lib/translations/nivel';
import { emPoucos, nivelDoSpotHome, quandoDe, rkDe } from './nivelHome';
import type { Modalidade } from '@/lib/modalidades';
import Frase from './Frase';
import LinhaSpot from './LinhaSpot';
import { bandaVars } from '@/lib/v6Tokens';
import type { EstadoHome } from '@/lib/home/estadoHome';
import type { SpotHome } from '@/lib/home/homeV6';
import type { FotoSpot } from '@/lib/spotFotos';
import type { BandaK } from '@/lib/modalidades';
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
  nivel,
  onNivel,
  cn,
  frase,
}: {
  E: EstadoHome;
  copy: HomeV6Copy;
  foto: FotoSpot | null;
  locale: string;
  hrefSpot: (sp: SpotHome, i: number) => string;
  d: Modalidade;
  onModalidade: (d: Modalidade) => void;
  /** #nivel-ui: nível escolhido (null = sem nível, a home fica igual à v6). */
  nivel: NivelUtilizador | null;
  onNivel: (v: MapDifficultyFilter) => void;
  cn: NivelCopy;
  /** A frase do nível nos casos «poucos» e «zero» (no lugar da nacional). */
  frase: { txt: string; b: BandaK } | null;
}) {
  const top = E.top[0];
  const fr = frase ?? E.frase;
  const poucos = !!nivel && emPoucos(E) && E.poucos ? E.poucos : null;
  const fora = nivel && !poucos && E.fora ? E.fora : null;
  const foraLv = fora ? nivelDoSpotHome(fora.sp, d) : undefined;
  const q = quandoDe(E, c);
  const prox = poucos && !poucos.dar ? E.proximoDoNivel : undefined;
  const temAcima = E.top.some((r) => r.acimaDoNivel);
  const l = E.linhas[0];
  const pal = c.veredito[E.palavra];
  // #nivel-ui: com o botão do nível o canto do selector fica mais largo, e uma data comprida
  // («qua 14 out · fim de tarde · 17h–20h») passava por baixo dele no desktop. Só quando se
  // tocam, a data quebra antes do selector (sem nível e no telemóvel nada muda).
  const modoRef = useRef<HTMLDivElement>(null);
  const quandoRef = useRef<HTMLParagraphElement>(null);
  const quandoTxt = `${E.quando.dia}|${E.quando.forte}|${E.quando.resto}`;
  useLayoutEffect(() => {
    const m = modoRef.current;
    const q = quandoRef.current;
    if (!m || !q) return;
    const toca = () => {
      const a = m.getBoundingClientRect();
      const b = q.getBoundingClientRect();
      return b.right > a.left - 12 && b.top < a.bottom + 4 && b.bottom > a.top ? Math.floor(a.left - 12 - b.left) : 0;
    };
    // 1.º aperta a data (letra e espaçamento) para caber numa linha; só se não chegar, quebra
    const ajusta = () => {
      q.style.maxWidth = '';
      q.classList.remove('aperta');
      if (!toca()) return;
      q.classList.add('aperta');
      const w = toca();
      if (w) q.style.maxWidth = `${Math.max(160, w)}px`;
    };
    ajusta();
    if (typeof ResizeObserver === 'undefined') return;
    // só larguras: a altura muda com a própria quebra (não pode voltar a disparar)
    const larg = new Map<Element, number>();
    const ro = new ResizeObserver((es) => {
      let mudou = false;
      for (const e of es) {
        const w = Math.round(e.contentRect.width);
        if (larg.get(e.target) !== w) {
          larg.set(e.target, w);
          mudou = true;
        }
      }
      if (mudou) ajusta();
    });
    ro.observe(m);
    if (q.parentElement) ro.observe(q.parentElement);
    return () => ro.disconnect();
  }, [quandoTxt, nivel]);
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
      <div className="hero-modo" data-testid="home-modo" ref={modoRef}>
        <NivelControl nivel={nivel} onEscolhe={onNivel} copy={cn} />
        <ModalidadeToggle valor={d} onChange={onModalidade} rotulos={c.modalidades} ariaLabel={c.modalidadeAria} />
      </div>
      <div className="hero-in">
        <p className="quando" data-testid="home-quando" ref={quandoRef}>
          {E.quando.dia} · <b>{E.quando.forte}</b> · <span className="nw">{E.quando.resto}</span>
        </p>
        <p className="gng" data-testid="home-palavra" data-palavra={E.palavra} aria-live="polite">
          {pal}
          {E.noite ? <small>{c.noiteSub}</small> : null}
          <span className="sr">: {c.banda[fr.b]}</span>
        </p>
        <p className="nac" data-testid="home-frase" data-frase-nivel={frase ? '' : undefined}>
          <Frase txt={fr.txt} banda={fr.b} />
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
            <LinhaSpot r={top} l={l} copy={c} seta rk={rkDe(E, top, l.rk, c, cn)} nivelRk={nivel ? cn.rkNivel(nivel) : null} />
          </a>
        ) : null}
        {fora && foraLv ? (
          <div className="nv-nota" data-testid="nivel-nota" data-estado="fora">
            <p className="fora">
              <a href={hrefSpot(fora.sp, fora.i)} data-spot={fora.sp.id}>
                {fora.sp.curto || fora.sp.nome}
              </a>{' '}
              <span className="nota" style={bandaVars(fora.b) as CSSProperties}>
                {fora.n ?? '–'}
              </span>
              {cn.foraResto(foraLv)}
            </p>
          </div>
        ) : null}
        {poucos && nivel ? (
          <div className="nv-nota" data-testid="nivel-nota" data-estado={poucos.dar ? 'poucos' : 'zero'}>
            <p className="poucos">
              <Ondas n={ondasDe(nivel)} />
              <b>{cn.poucosT(poucos.dar, poucos.total, nivel, q)}</b>
              <span>
                {prox !== undefined ? (prox ? cn.proximo(c.nomeBloco(prox.bloco.dia, prox.bloco.k), prox.linha.sp.curto || prox.linha.sp.nome) : cn.nuncaMais) + ' ' : ''}
                {temAcima ? cn.marcados : cn.soNivel}
              </span>
            </p>
          </div>
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
