'use client';

/**
 * Home v6 «Atlântico» (#183), por baixo do cabeçalho do site (com os tokens v6, ver
 * docs/pr-183/cabecalho.md): hero do nº 1 (selector Kite · Surf, «VAI.» + frase nacional +
 * cartão do nº 1), nº 2 e nº 3, mapa 3D da costa
 * (ao lado do hero no desktop; faixa no telemóvel) e a régua de
 * blocos de hoje e amanhã. Contrato: docs/design/maquetes/v6-atlantico.
 * v7 «Porta do mapa» (#273): o cartão do mapa é a porta do /mapa, com o contexto
 * da home no URL (`hrefMapa`: modalidade, bloco/hora, câmara, spot, `de=home`).
 *
 * Um só motor e uma só lista: as horas são o objecto da página de spot
 * (`horaDeLinha`), as notas o `avaliaHoras` do spot, e palavra, frase, top 3,
 * fotos, régua e mapa saem todos de `estadoHome` (um `ranking()` por bloco).
 * O HTML estático leva a palavra, a frase e o nº 1 do momento do build; depois
 * de montar passa ao relógio real, a `?d=` / `ventu.modalidade` e a `?b=`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import '@/styles/v6-fontes.css';
import '@/styles/v6-home.css';
import '@/styles/v6-nivel.css';
import HomeHero from './HomeHero';
import SpotCardV6 from './SpotCardV6';
import ReguaBlocos from './ReguaBlocos';
import CostaMapa3D from './CostaMapa3D';
import { isModalidade, MODALIDADE_OMISSAO, type Modalidade } from '@/lib/modalidades';
import { compactarCosta, montarCosta, type CostaCompacta, type MetaCosta } from '@/lib/home/dadosHome';
import { criarModelo, type SpotHome } from '@/lib/home/homeV6';
import { estadoHome } from '@/lib/home/estadoHome';
import { gravarPrefModalidade, modalidadeInicial, MODALIDADE_EVENT } from '@/lib/modalidadePref';
import { SPORT_CHANGE_EVENT } from '@/lib/homepageSport';
import { homeV6Copy } from '@/lib/translations/homeV6';
import { getAssetPath } from '@/lib/paths';
import { hrefMapa as montarHrefMapa } from '@/lib/home/hrefMapa';
import type { FotoSpot } from '@/lib/spotFotos';
import type { LinhaForecast } from '@/lib/horaSpot';
import { useNivel } from '@/lib/nivelPref';
import { nivelCopyV6 } from '@/lib/translations/nivel';
import { emPoucos, fraseNivel, nivelDoSpotHome, rkDe } from './nivelHome';

export interface HomeV6Props {
  locale: string;
  costa: CostaCompacta;
  meta: MetaCosta;
  fotos: Record<string, Record<Modalidade, FotoSpot | null>>;
  /** Relógio do build (SSG); depois de montar passa ao relógio real. */
  agoraMs: number;
  /** Spots de cada modalidade no /mapa (filtro do próprio /mapa sobre o índice de spots). */
  nSpots: Record<Modalidade, number>;
}

/** Fontes do primeiro ecrã (palavra, nomes, frase). */
const PRELOAD = ['BarlowCondensed-900i-latin.woff2', 'Barlow-600-latin.woff2', 'Barlow-700-latin.woff2'];

export default function HomeV6({ locale, costa: costaSSG, meta, fotos, agoraMs, nSpots }: HomeV6Props) {
  const c = homeV6Copy(locale);
  const cn = nivelCopyV6(locale);
  // #nivel-ui: o nível do /mapa (`ventu:map:difficulty`), lido só depois de montar (null no SSG)
  const [nivel, escolheNivel] = useNivel();
  const [d, setD] = useState<Modalidade>(MODALIDADE_OMISSAO);
  const [b, setB] = useState<string | null>(null);
  const [agora, setAgora] = useState(agoraMs);
  const [compacta, setCompacta] = useState(costaSSG);
  const [flags, setFlags] = useState({ plano: false, vivo: false });
  // largura do desktop (câmara z=7 e vento sempre ligado no link do /mapa); o HTML estático leva o desktop
  const [desk, setDesk] = useState(true);

  // depois de montar: relógio real, ?d= / ventu.modalidade, ?b=, ?webgl=0
  useEffect(() => {
    const qs = window.location.search;
    const p = new URLSearchParams(qs);
    setAgora(Date.now());
    const m = modalidadeInicial(qs);
    if (m) setD(m);
    const bq = p.get('b');
    if (bq) setB(bq);
    setFlags({ plano: p.get('webgl') === '0', vivo: true });
    const mq = window.matchMedia('(min-width: 1024px)');
    setDesk(mq.matches);
    const largura = (e: MediaQueryListEvent) => setDesk(e.matches);
    mq.addEventListener('change', largura);
    const ouve = (e: Event) => {
      const v = (e as CustomEvent).detail;
      if (isModalidade(v)) setD(v);
    };
    window.addEventListener(MODALIDADE_EVENT, ouve);
    // costura dos e2e herméticos (a mesma da página de spot): com `ventu_live=1` a home
    // lê o forecast servido (`/data/forecasts/<série>.json`) em vez do snapshot do build
    let vivo = true;
    if (document.cookie.split(';').some((x) => x.trim() === 'ventu_live=1')) {
      void Promise.all(
        Object.entries(meta).map(async ([id, s]) => {
          try {
            const r = await fetch(getAssetPath(`/data/forecasts/${s.serie}.json`));
            return [id, r.ok ? ((await r.json()) as LinhaForecast[]) : []] as const;
          } catch {
            return [id, [] as LinhaForecast[]] as const;
          }
        }),
      ).then((es) => {
        if (vivo) {
          const t = Date.now();
          setCompacta(compactarCosta(Object.fromEntries(es), t, meta));
          setAgora(t);
        }
      });
    }
    return () => {
      vivo = false;
      window.removeEventListener(MODALIDADE_EVENT, ouve);
      mq.removeEventListener('change', largura);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const costa = useMemo(() => montarCosta(compacta, agora, meta), [compacta, agora, meta]);
  const M = useMemo(() => criarModelo(costa.spots, c), [costa.spots, c]);
  const E = useMemo(
    () => (costa.spots.length ? estadoHome(M, d, costa.agoraI < 0 ? 0 : costa.agoraI, b, nivel) : null),
    [M, d, costa, b, nivel],
  );
  const fraseNv = useMemo(() => (E ? fraseNivel(E, nivel, c, cn) : null), [E, nivel, c, cn]);

  const hrefSpot = useCallback(
    (sp: SpotHome, i: number) => {
      const j = E ? i - E.agoraI : 0;
      return `/${locale}/spots/${meta[sp.id]?.slug ?? sp.id}/?d=${d}${j > 0 ? `&h=${j}` : ''}`;
    },
    [locale, meta, d, E],
  );
  // #273: o URL do /mapa acompanha a modalidade (`muda`) e o bloco (`escolhe`): sai de E
  const hrefMapa = useCallback(
    (spotId?: string) =>
      E
        ? montarHrefMapa({ locale, d, tMapa: M.t(E.horaMapa), tAgora: M.t(E.agoraI), desk, spot: spotId })
        : `/${locale}/mapa/`,
    [locale, d, M, E, desk],
  );
  const muda = useCallback((m: Modalidade) => {
    setD(m);
    gravarPrefModalidade(m);
    window.dispatchEvent(new Event(SPORT_CHANGE_EVENT));
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('d', m);
      window.history.replaceState(window.history.state, '', u.toString());
    } catch {
      /* noop */
    }
  }, []);
  const escolhe = useCallback((id: string) => setB(id), []);

  useEffect(() => {
    if (!E || !flags.vivo) return;
    document.title = c.titulo(c.veredito[E.palavra], (fraseNv ?? E.frase).txt.replace(/<[^>]*>/g, '').replace(/[<>]/g, ''));
  }, [E, c, flags.vivo, fraseNv]);

  if (!E) return <p className="sr">{c.semDados}</p>;
  const heroFoto = E.top[0] ? (fotos[E.top[0].sp.id]?.[d] ?? null) : null;

  return (
    <div
      className={`v6h${flags.vivo ? ' vivo' : ''}${E.noite ? ' e-noite' : ''}`}
      data-testid="home-v6"
      data-modalidade={d}
      data-bloco={E.bId ?? ''}
      data-hora={M.t(E.agoraI)}
      style={{ ['--band' as string]: `var(--b-${E.banda})`, ['--band-t' as string]: `var(--b-${E.banda}-t)` }}
    >
      {PRELOAD.map((fn) => (
        <link key={fn} rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href={getAssetPath(`/fonts/barlow/${fn}`)} />
      ))}
      <div className={`topo${nivel && emPoucos(E) ? ' nv-poucos' : ''}`}>
        <HomeHero
          E={E}
          copy={c}
          foto={heroFoto}
          locale={locale}
          hrefSpot={hrefSpot}
          d={d}
          onModalidade={muda}
          nivel={nivel}
          onNivel={escolheNivel}
          cn={cn}
          frase={fraseNv}
        />
        <section className="outros" aria-label={c.outrosAria} data-testid="home-outros">
          {E.top.slice(1).map((r, k) => (
            <SpotCardV6
              key={`${r.sp.id}-${d}`}
              r={r}
              l={E.linhas[k + 1]}
              k={k}
              foto={fotos[r.sp.id]?.[d] ?? null}
              href={hrefSpot(r.sp, r.i)}
              copy={c}
              locale={locale}
              rk={rkDe(E, r, E.linhas[k + 1]?.rk ?? '', c, cn)}
              nivelRk={nivel ? cn.rkNivel(nivel) : null}
              tagNivel={(() => {
                const lv = r.acimaDoNivel ? nivelDoSpotHome(r.sp, d) : undefined;
                return lv ? { txt: cn.tag(lv), lv } : null;
              })()}
            />
          ))}
        </section>
        <CostaMapa3D M={M} E={E} copy={c} hrefMapa={hrefMapa} nSpots={nSpots[d]} forcarPlano={flags.plano} nivel={nivel} legendaNivel={cn.legenda} />
      </div>
      <ReguaBlocos E={E} copy={c} onEscolhe={escolhe} />
      {/* div e não <footer>: o rodapé da página é o do site (contentinfo único, spec data-sources) */}
      <div className="rodape" data-testid="home-v6-rodape">
        <nav aria-label={c.rodapeLinks}>
          <ul>
            <li>
              <a href={`/${locale}/spots/`}>{c.todosSpots}</a>
            </li>
            <li>
              <a href={`/${locale}/about/`}>{c.comoLemos}</a>
            </li>
          </ul>
        </nav>
        <p>{c.fonte}</p>
        <p>
          {c.fotosA}
          <a href={getAssetPath('/fotos/spots/CREDITOS.md')}>{c.creditos}</a>
          {c.fotosB}
        </p>
      </div>
    </div>
  );
}
