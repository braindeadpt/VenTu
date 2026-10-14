'use client';

/**
 * Página de spot v6 «Atlântico» (#184): TopBar, SpotHero, Regua48h, Porquê,
 * PraiaCena3D e EstudarSpot. Contrato: docs/design/maquetes/v6-atlantico.
 *
 * Regra de ouro: um objecto por spot e hora (`construirHoras`), avaliado uma
 * vez por modalidade (`avaliaHoras`); veredicto, régua, Porquê, cor do mar,
 * chip do vento e tabela lêem TODOS o mesmo `horas[i]` / `NS[i]`.
 */
import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SpotTimelineDataContext, SpotTimelineIndexContext } from '@/components/spots/timeline/SpotTimelineProvider';
import WindSafetyNote from '@/components/ui/WindSafetyNote';
import '@/styles/v6-fontes.css';
import '@/styles/v6-atlantico.css';
import TopBar from './TopBar';
import SpotHero from './SpotHero';
import Regua48h from './Regua48h';
import Porque from './Porque';
import PraiaCena3D, { type Vizinho } from './PraiaCena3D';
import EstudarSpot from './EstudarSpot';
import AvisoRegua from './AvisoRegua';
import { avaliaHoras, isModalidade, MODALIDADE_OMISSAO, type Modalidade } from '@/lib/modalidades';
import { construirHoras, type LinhaForecast } from '@/lib/horaSpot';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';
import { bandaR, construirFrase, diaCurto, horaDe, horaTxt, palavraEResto } from '@/lib/spotVeredicto';
import { gravarPrefModalidade, modalidadeInicial, MODALIDADE_EVENT } from '@/lib/modalidadePref';
import { spotV6Copy } from '@/lib/translations/spotPage/v6';
import { getAssetPath } from '@/lib/paths';
import type { FotoSpot } from '@/lib/spotFotos';
import type { Spot } from '@/types';

export interface SpotV6Props {
  spot: Spot;
  nome: string;
  local: string;
  locale: string;
  linhas: readonly LinhaForecast[];
  /** Relógio do build (SSG); depois de montar passa ao relógio real. */
  agoraMs: number;
  fotos: Record<Modalidade, FotoSpot | null>;
  vizinhos: readonly Vizinho[];
  atencao: string | null;
  melhorMare: string | null;
  /** Avisa o resto da página (instrumentos, previsão) da modalidade escolhida. */
  onModalidade?: (d: Modalidade) => void;
  /** Faixa de segurança (avisos IPMA / estado do mar / costeiros), só com aviso activo. */
  seguranca?: ReactNode;
  /** Acções do spot (como chegar, favorito, alerta, câmara, mais). */
  acoes?: ReactNode;
}

/** Fontes do primeiro ecrã (nome, nota, palavra, frase). */
const PRELOAD = ['BarlowCondensed-900i-latin.woff2', 'BarlowCondensed-900-latin.woff2', 'Barlow-700-latin.woff2'];

export default function SpotV6({ spot, nome, local, locale, linhas, agoraMs, fotos, vizinhos, atencao, melhorMare, onModalidade, seguranca, acoes }: SpotV6Props) {
  const copy = spotV6Copy(locale);
  const ed = useMemo(() => editorialDe(spot), [spot]);
  const sp = useMemo(() => spotModalidadeDe(ed), [ed]);
  const omissao: Modalidade = spot.compatibleSports?.includes('kitesurf') ? MODALIDADE_OMISSAO : 'surf';
  const [d, setD] = useState<Modalidade>(omissao);
  const [agora, setAgora] = useState(agoraMs);
  const [i, setI] = useState(0);
  const [pendH, setPendH] = useState<number | null>(null);
  const [flags, setFlags] = useState({ plano: false, captura: false, estudo: false, vivo: false });

  // depois de montar: relógio real, ?d= / ventu.modalidade, ?h=, ?webgl=0, ?estudo=1
  useEffect(() => {
    const qs = window.location.search;
    const p = new URLSearchParams(qs);
    setAgora(Date.now());
    const m = modalidadeInicial(qs);
    if (m) {
      setD(m);
      onModalidade?.(m);
    }
    const hq = Number(p.get('h'));
    if (Number.isFinite(hq) && hq > 0) setPendH(Math.floor(hq));
    setFlags({ plano: p.get('webgl') === '0', captura: p.has('captura'), estudo: p.get('estudo') === '1', vivo: true });
    const ouve = (e: Event) => {
      const v = (e as CustomEvent).detail;
      if (isModalidade(v)) setD(v);
    };
    window.addEventListener(MODALIDADE_EVENT, ouve);
    return () => window.removeEventListener(MODALIDADE_EVENT, ouve);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dados = useMemo(
    () => construirHoras(linhas, { lat: spot.lat, lon: spot.lon, praiaVirada: ed.praiaVirada }, agora),
    [linhas, spot.lat, spot.lon, ed.praiaVirada, agora],
  );
  const H = dados.horas;
  const NS = useMemo(() => avaliaHoras(sp, d, H), [sp, d, H]);
  const frase = useMemo(
    () => construirFrase({ sp, d, H, NS, sol: dados.sol, copy, locale }),
    [sp, d, H, NS, dados.sol, copy, locale],
  );
  const iSel = Math.max(0, Math.min(H.length - 1, i));
  // Eixo de tempo partilhado com o resto da página (instrumentos, previsão
  // hora a hora): a régua v6 escreve nele e segue-o quando outra secção muda a hora.
  const tlData = useContext(SpotTimelineDataContext);
  const tlIdx = useContext(SpotTimelineIndexContext);
  const tlHoras = tlData?.hours;
  const tlSet = tlIdx?.setIndex;
  const escolhe = useCallback(
    (j: number) => {
      const k = Math.max(0, Math.min(H.length - 1, j));
      setI(k);
      const t = H[k]?.t;
      if (t && tlHoras && tlSet) {
        const x = tlHoras.findIndex((hh) => hh.slice(0, 16) === t);
        if (x >= 0) tlSet(x);
      }
    },
    [H, tlHoras, tlSet],
  );
  useEffect(() => {
    if (pendH == null || !H.length) return;
    escolhe(pendH);
    setPendH(null);
  }, [pendH, H.length, escolhe]);
  const tlSel = tlIdx?.selectedHour?.slice(0, 16);
  useEffect(() => {
    if (!tlSel) return;
    const j = H.findIndex((hh) => hh.t === tlSel);
    if (j >= 0) setI((cur) => (cur === j ? cur : j));
  }, [tlSel, H]);
  const muda = useCallback(
    (m: Modalidade) => {
      setD(m);
      gravarPrefModalidade(m);
      onModalidade?.(m);
    },
    [onModalidade],
  );

  if (!H.length) return null;
  const h = H[iSel];
  const r = NS[iSel];
  const b = bandaR(r);
  const f = frase(iSel);
  const { palavra, resto } = palavraEResto(copy, f, b);
  const quandoDia = `${copy.dias[new Date(Date.UTC(+h.t.slice(0, 4), +h.t.slice(5, 7) - 1, +h.t.slice(8, 10))).getUTCDay()]} ${+h.t.slice(8, 10)} ${copy.meses[+h.t.slice(5, 7) - 1]}`;
  const ehAgora = iSel === 0 && !dados.semAgora;
  const porqueQ = ehAgora ? copy.agora : `${diaCurto(copy, h.t)}, ${horaTxt(copy, horaDe(h.t))}`;
  const regua = H.map((x, j) => ({ t: x.t, n: NS[j].n, banda: bandaR(NS[j]) }));
  const temNoite = r.n == null;

  return (
    <div
      className={`v6${flags.vivo ? ' vivo' : ''}${temNoite ? ' e-noite' : ''}${flags.captura ? ' captura' : ''}`}
      data-testid="spot-v6"
      data-modalidade={d}
      data-hora={h.t}
      data-sem-agora={dados.semAgora ? '' : undefined}
      style={{ ['--band' as string]: `var(--b-${b})`, ['--band-t' as string]: `var(--b-${b}-t)` }}
    >
      {PRELOAD.map((fn) => (
        <link key={fn} rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href={getAssetPath(`/fonts/barlow/${fn}`)} />
      ))}
      <TopBar locale={locale} copy={copy} d={d} onModalidade={muda} />
      <SpotHero
        nome={nome}
        quando={{ local, dia: quandoDia, hora: horaTxt(copy, horaDe(h.t)), agora: ehAgora }}
        n={r.n}
        banda={b}
        palavra={palavra}
        resto={resto}
        apoio={f.l2}
        foto={fotos[d]}
        locale={locale}
        copy={copy}
        faltaTxt={dados.semAgora ? copy.semPrevisao : null}
      />
      {r.seguranca ? (
        <div className="seguranca">
          <WindSafetyNote level={r.seguranca} locale={locale} className="mt-3" />
        </div>
      ) : null}
      {seguranca ? <div className="seguranca">{seguranca}</div> : null}
      <Regua48h horas={regua} i={iSel} onEscolhe={escolhe} copy={copy} semAgora={dados.semAgora} aviso={<AvisoRegua spotId={spot.id} locale={locale} />} />
      <div className="corpo-d">
        <Porque h={h} r={r} d={d} sp={sp} mares={dados.mares} quando={porqueQ} copy={copy} locale={locale} />
        <PraiaCena3D
          nome={nome}
          ll={[spot.lon, spot.lat]}
          praiaVirada={ed.praiaVirada}
          vizinhos={vizinhos}
          h={h}
          banda={b}
          d={d}
          copy={copy}
          forcarPlano={flags.plano}
          captura={flags.captura}
        />
      </div>
      {acoes}
      <EstudarSpot
        key={flags.estudo ? 'aberto' : 'fechado'}
        horas={H}
        NS={NS}
        i={iSel}
        d={d}
        ed={ed}
        sol={dados.sol}
        atencao={atencao}
        melhorMare={melhorMare}
        copy={copy}
        locale={locale}
        abertoInicial={flags.estudo}
      />
      <p className="falta-dados" data-testid="falta-dados">
        {dados.faltam.includes('rain') ? copy.faltaChuvaNuvens : null}
      </p>
    </div>
  );
}
