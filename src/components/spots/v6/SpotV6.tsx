'use client';

/**
 * Página de spot v6 «Atlântico» (#184): TopBar, SpotHero, Regua48h, Porquê,
 * PraiaCena3D, EstudarSpot e o contexto do spot. Contrato: docs/design/maquetes/v6-atlantico.
 *
 * Regra de ouro: um objecto por spot e hora (`construirHoras`), avaliado uma
 * vez por modalidade (`avaliaHoras`); veredicto, régua, Porquê, cor do mar,
 * chip do vento e tabela lêem TODOS o mesmo `horas[i]` / `NS[i]`.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import WindSafetyNote from '@/components/ui/WindSafetyNote';
import '@/styles/v6-fontes.css';
import '@/styles/v6-atlantico.css';
import '@/styles/v6-nivel.css';
import TopBar from './TopBar';
import SpotHero from './SpotHero';
import Regua48h from './Regua48h';
import Porque from './Porque';
import PraiaCena3D, { type Vizinho } from './PraiaCena3D';
import EstudarSpot from './EstudarSpot';
import AvisoRegua from './AvisoRegua';
import NivelAviso from './NivelAviso';
import { useVizinhosNivel } from './useVizinhosNivel';
import { useNivel } from '@/lib/nivelPref';
import { nivelCopyV6 } from '@/lib/translations/nivel';
import { nivelDoSpot, spotDentroDoNivel, type NivelUtilizador } from '@/lib/mapDifficulty';
import { avaliaHoras, isModalidade, MODALIDADE_OMISSAO, type Modalidade } from '@/lib/modalidades';
import { construirHoras, type LinhaForecast, type MareExtremo } from '@/lib/horaSpot';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';
import { bandaR, construirFrase, diaCurto, horaDe, horaTxt, palavraEResto } from '@/lib/spotVeredicto';
import { gravarPrefModalidade, modalidadeInicial, MODALIDADE_EVENT } from '@/lib/modalidadePref';
import { spotV6Copy } from '@/lib/translations/spotPage/v6';
import { getAssetPath } from '@/lib/paths';
import type { FotoSpot } from '@/lib/spotFotos';
import type { Spot } from '@/types';

/** O que a hora escolhida na régua dá aos blocos de fora da maquete (estudo e contexto). */
export interface SpotV6Hora {
  /** Hora escolhida (ISO local `YYYY-MM-DDTHH:MM`). */
  t: string;
  ehAgora: boolean;
  d: Modalidade;
  /** Extremos de maré da janela — os mesmos do Porquê. */
  mares: readonly MareExtremo[];
  /** O extremo que o Porquê cita para esta hora (não se repete noutro sítio). */
  citada?: MareExtremo;
  /** #nivel-ui: nível escolhido (null = sem nível), para o «Do teu nível, perto daqui». */
  nivel: NivelUtilizador | null;
}

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
  /** Avisa a página (alerta das acções) da modalidade escolhida. */
  onModalidade?: (d: Modalidade) => void;
  /** Faixa de segurança (avisos IPMA / estado do mar / costeiros), só com aviso activo. */
  seguranca?: ReactNode;
  /** Acções do spot (como chegar, favorito, alerta, câmara, mais). */
  acoes?: ReactNode;
  /** O que só o contexto do spot traz (avisos, câmara, estação, água, chegar e estar, perto daqui, eventos). */
  contexto?: ReactNode | ((h: SpotV6Hora) => ReactNode);
  /** Fim do «Estudar o spot»: o que se mede e o que se sabe (boia, maré e lua, sol e ar, fundo, clima). */
  estudo?: (h: SpotV6Hora) => ReactNode;
}

/** Fontes do primeiro ecrã (nome, nota, palavra, frase). */
const PRELOAD = ['BarlowCondensed-900i-latin.woff2', 'BarlowCondensed-900-latin.woff2', 'Barlow-700-latin.woff2'];

export default function SpotV6({ spot, nome, local, locale, linhas, agoraMs, fotos, vizinhos, atencao, melhorMare, onModalidade, seguranca, acoes, contexto, estudo }: SpotV6Props) {
  const copy = spotV6Copy(locale);
  const ed = useMemo(() => editorialDe(spot), [spot]);
  const sp = useMemo(() => spotModalidadeDe(ed), [ed]);
  const omissao: Modalidade = spot.compatibleSports?.includes('kitesurf') ? MODALIDADE_OMISSAO : 'surf';
  const [d, setD] = useState<Modalidade>(omissao);
  const [agora, setAgora] = useState(agoraMs);
  const [i, setI] = useState(0);
  const [pendH, setPendH] = useState<number | null>(null);
  const [flags, setFlags] = useState({ plano: false, estudo: false, vivo: false });
  // #nivel-ui: o nível do /mapa (`ventu:map:difficulty`), lido só depois de montar (null no SSG)
  const cn = nivelCopyV6(locale);
  const [nivel, escolheNivel] = useNivel();
  const [menuNivel, setMenuNivel] = useState(false);

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
    setFlags({ plano: p.get('webgl') === '0', estudo: p.get('estudo') === '1', vivo: true });
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
  const escolhe = useCallback((j: number) => setI(Math.max(0, Math.min(H.length - 1, j))), [H.length]);
  useEffect(() => {
    if (pendH == null || !H.length) return;
    escolhe(pendH);
    setPendH(null);
  }, [pendH, H.length, escolhe]);
  const muda = useCallback(
    (m: Modalidade) => {
      setD(m);
      gravarPrefModalidade(m);
      onModalidade?.(m);
    },
    [onModalidade],
  );

  const sport = d === 'kite' ? 'kitesurf' : 'surf';
  const nivelSpot = nivelDoSpot(spot, sport);
  const acimaNivel = !!nivel && !spotDentroDoNivel(nivelSpot, nivel);
  // sem nível: só a dica, e só num spot intermédio ou acima (o estudo §4); «Todos os níveis» e sem nível na ficha nunca
  const dicaNivel = !nivel && (nivelSpot === 'intermediate' || nivelSpot === 'advanced' || nivelSpot === 'expert');
  const tSel = H[iSel]?.t;
  const vizinhosNivel = useVizinhosNivel(spot, sport, nivel, tSel, acimaNivel);

  if (!H.length) return null;
  const h = H[iSel];
  const r = NS[iSel];
  const b = bandaR(r);
  const f = frase(iSel);
  const { palavra, resto } = palavraEResto(copy, f, b, !!r.semDados, !!r.soProfissionais);
  const quandoDia = `${copy.dias[new Date(Date.UTC(+h.t.slice(0, 4), +h.t.slice(5, 7) - 1, +h.t.slice(8, 10))).getUTCDay()]} ${+h.t.slice(8, 10)} ${copy.meses[+h.t.slice(5, 7) - 1]}`;
  const ehAgora = iSel === 0 && !dados.semAgora;
  const porqueQ = ehAgora ? copy.agora : `${diaCurto(copy, h.t)}, ${horaTxt(copy, horaDe(h.t))}`;
  const regua = H.map((x, j) => ({ t: x.t, n: NS[j].n, banda: bandaR(NS[j]), ...(NS[j].semDados ? { semDados: true } : {}) }));
  const temNoite = r.n == null && !r.semDados;
  const hv: SpotV6Hora = {
    t: h.t,
    ehAgora,
    d,
    mares: dados.mares,
    citada: Number.isFinite(h.tide) ? dados.mares.find((m) => m.t > h.t) : undefined,
    nivel,
  };

  return (
    <div
      className={`v6${flags.vivo ? ' vivo' : ''}${temNoite ? ' e-noite' : ''}`}
      data-testid="spot-v6"
      data-modalidade={d}
      data-hora={h.t}
      data-sem-agora={dados.semAgora ? '' : undefined}
      style={{ ['--band' as string]: `var(--b-${b})`, ['--band-t' as string]: `var(--b-${b}-t)` }}
    >
      {PRELOAD.map((fn) => (
        <link key={fn} rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href={getAssetPath(`/fonts/barlow/${fn}`)} />
      ))}
      <TopBar
        locale={locale}
        copy={copy}
        d={d}
        onModalidade={muda}
        nivel={nivel}
        onNivel={escolheNivel}
        cn={cn}
        menuNivel={menuNivel}
        onMenuNivel={setMenuNivel}
      />
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
        semDados={!!r.semDados}
        aviso={
          acimaNivel || dicaNivel ? (
            <NivelAviso
              spot={spot}
              d={d}
              nivel={nivel}
              nivelSpot={nivelSpot}
              modo={acimaNivel ? 'acima' : 'dica'}
              vizinhos={vizinhosNivel}
              locale={locale}
              cn={cn}
              onQualNivel={() => setMenuNivel(true)}
            />
          ) : null
        }
      />
      {r.soProfissionais ? (
        <div className="seguranca" data-testid="spot-so-profissionais">
          <WindSafetyNote level="so-profissionais" locale={locale} className="mt-3" />
        </div>
      ) : null}
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
          idEstatico={ed.estimado ? undefined : spot.id}
          praiaVirada={ed.praiaVirada}
          vizinhos={vizinhos}
          h={h}
          banda={b}
          d={d}
          copy={copy}
          forcarPlano={flags.plano}
          rotulos={ed.rotulos}
        />
      </div>
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
        extra={estudo ? estudo(hv) : null}
      />
      {/* fora da maquete: o contexto do spot (o que a v6 não tinha) e as acções, depois do «Estudar o spot»,
          para o Porquê e a praia 3D seguirem a maquete */}
      {typeof contexto === 'function' ? contexto(hv) : contexto}
      {acoes}
      <p className="falta-dados" data-testid="falta-dados">
        {[
          dados.faltam.includes('onda') && d === 'surf' ? copy.faltaOnda : null,
          dados.faltam.includes('agua') ? copy.faltaAgua : null,
          dados.faltam.includes('rain') ? copy.faltaChuvaNuvens : null,
        ]
          .filter(Boolean)
          .join(' ') || null}
      </p>
    </div>
  );
}
