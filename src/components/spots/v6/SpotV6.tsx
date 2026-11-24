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
import { getCompatibleSports, type SportType } from '@/lib/sportRatings';
import { sportParaMapa } from '@/lib/praiaCena';
import { isModalidade, type Modalidade } from '@/lib/modalidades';
import {
  avaliaHorasSpotV6,
  isSpotModalidadeAtiva,
  modalidadeOmissaoSpot,
  modalidadesCompativeisSpot,
  resolverModalidadeSpot,
  spotModParaBase,
  spotModParaSport,
  type SpotModalidadeAtiva,
} from '@/lib/spotV6Modalidade';
import { construirHoras, indiceHoraPorInstante, mareDepois, type LinhaForecast, type MareExtremo } from '@/lib/horaSpot';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';
import { bandaR, construirFrase, diaCurto, horaDe, horaTxt, palavraEResto } from '@/lib/spotVeredicto';
import { gravarPrefModalidade, lerPrefModalidade, MODALIDADE_EVENT } from '@/lib/modalidadePref';
import { spotV6Copy } from '@/lib/translations/spotPage/v6';
import { getAssetPath } from '@/lib/paths';
import type { FotoSpot } from '@/lib/spotFotos';
import type { Spot } from '@/types';

/** O que a hora escolhida na régua dá aos blocos de fora da maquete (estudo e contexto). */
export interface SpotV6Hora {
  /** Hora escolhida (ISO local `YYYY-MM-DDTHH:MM`). */
  t: string;
  /** Instante UTC real (ms) da hora escolhida (DST-safe). */
  ms?: number;
  ehAgora: boolean;
  d: SpotModalidadeAtiva;
  /** Desporto do site correspondente a `d` (ex. `kitesurf`, `windsurf`, `wakeboard`). */
  sport: SportType;
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
  /** Relógio partilhado da ficha (P2.2): o do build no 1.º paint; depois de
   *  montar o dono fá-lo avançar — o mesmo que aplica as observações à hora
   *  «Agora» (`aplicarObservacoesNaHoraAgora` no SpotDetailClient). */
  agoraMs: number;
  fotos: Record<Modalidade, FotoSpot | null>;
  vizinhos: readonly Vizinho[];
  atencao: string | null;
  melhorMare: string | null;
  /** Avisa a página (alerta das acções) do desporto escolhido. */
  onModalidade?: (sport: SportType) => void;
  /** Faixa de segurança (avisos IPMA / estado do mar / costeiros), só com aviso activo. */
  seguranca?: ReactNode;
  /** Acções do spot (como chegar, favorito, alerta, câmara, mais). */
  acoes?: ReactNode;
  /** O que só o contexto do spot traz (avisos, câmara, estação, água, chegar e estar, perto daqui, eventos). */
  contexto?: ReactNode | ((h: SpotV6Hora) => ReactNode);
  /** O que se mede e o que se sabe (boia, maré e lua, sol e ar, fundo, clima) — visível fora do `<details>` (#459). */
  estudo?: (h: SpotV6Hora) => ReactNode;
}

/** Fontes do primeiro ecrã (nome, nota, palavra, frase). */
const PRELOAD = ['BarlowCondensed-900i-latin.woff2', 'BarlowCondensed-900-latin.woff2', 'Barlow-700-latin.woff2'];
/** Spots fora de spotEditorial.json com geografia OSM pré-gerada em public/geo/praia/ (albufeiras + ilhas + icónicos). */
const GEO_ESTATICOS_EXTRAS = new Set([
  'alqueva',
  'castelo-bode',
  'ilha-do-ermal',
  'praia-da-lomba',
  'coxos',
  'sao-lourenco',
  'jardim-mar',
  'paul-mar',
  'sao-vicente-madeira',
  'santa-barbara',
  'mosteiros',
  'amado',
  'bordeira',
  'monte-clerigo',
  'beliche',
]);

export default function SpotV6({ spot, nome, local, locale, linhas, agoraMs, fotos, vizinhos, atencao, melhorMare, onModalidade, seguranca, acoes, contexto, estudo }: SpotV6Props) {
  const copy = spotV6Copy(locale);
  const ed = useMemo(() => editorialDe(spot), [spot]);
  const sp = useMemo(() => spotModalidadeDe(ed), [ed]);
  const compativeis = useMemo(() => modalidadesCompativeisSpot(spot), [spot]);
  const opcoesTop = useMemo<SpotModalidadeAtiva[]>(() => {
    if (compativeis.includes('kite') && compativeis.includes('surf')) return ['kite', 'surf'];
    return compativeis.slice(0, 2);
  }, [compativeis]);
  const omissao = useMemo(() => modalidadeOmissaoSpot(spot), [spot]);
  const [d, setD] = useState<SpotModalidadeAtiva>(omissao);
  // Selecção da régua: `null` = «Agora» (segue o relógio); objecto = a hora
  // fixada pelo INSTANTE UTC (`ms`, à prova do 01:00 repetido do DST) — a
  // janela desliza com o relógio e um índice nu passaria a apontar para
  // outra hora (revisão P2.2). `i` fica de recurso para linhas sem `ms`.
  const [sel, setSel] = useState<{ i: number; ms: number | null } | null>(null);
  const [pendH, setPendH] = useState<number | null>(null);
  const [flags, setFlags] = useState({ plano: false, estudo: false, vivo: false });
  // #nivel-ui: o nível do /mapa (`ventu:map:difficulty`), lido só depois de montar (null no SSG)
  const cn = nivelCopyV6(locale);
  const [nivel, escolheNivel] = useNivel();
  const [menuNivel, setMenuNivel] = useState(false);

  // depois de montar: ?sport= / ?d= / ventu.modalidade (só se compatível com o spot), ?h=, ?webgl=0, ?estudo=1
  // (o relógio reactivo — P2.2 — é o do SpotDetailClient e chega por
  // `agoraMs`: UM relógio comum move a régua e a aplicação das observações)
  useEffect(() => {
    const qs = window.location.search;
    const p = new URLSearchParams(qs);
    const m = resolverModalidadeSpot(spot, qs, lerPrefModalidade()?.d ?? null);
    setD(m);
    onModalidade?.(spotModParaSport(m));
    const hq = Number(p.get('h'));
    if (Number.isFinite(hq) && hq > 0) setPendH(Math.floor(hq));
    setFlags({ plano: p.get('webgl') === '0', estudo: p.get('estudo') === '1', vivo: true });
    const ouve = (e: Event) => {
      const v = (e as CustomEvent).detail;
      if (isSpotModalidadeAtiva(v) && compativeis.includes(v)) setD(v);
    };
    window.addEventListener(MODALIDADE_EVENT, ouve);
    return () => {
      window.removeEventListener(MODALIDADE_EVENT, ouve);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dados = useMemo(
    () => construirHoras(linhas, { lat: spot.lat, lon: spot.lon, praiaVirada: ed.praiaVirada }, agoraMs),
    [linhas, spot.lat, spot.lon, ed.praiaVirada, agoraMs],
  );
  const H = dados.horas;
  const NS = useMemo(() => avaliaHorasSpotV6(spot, sp, d, H), [spot, sp, d, H]);
  const frase = useMemo(
    () => construirFrase({ sp, d, H, NS, sol: dados.sol, copy, locale }),
    [sp, d, H, NS, dados.sol, copy, locale],
  );
  // O índice visado re-encontra o INSTANTE escolhido na janela actual
  // (`indiceHoraPorInstante`): quando o relógio avança e a régua desliza,
  // a mesma hora fica seleccionada na nova posição; se já saiu da janela,
  // cai na mais próxima — passado → «Agora». «Agora» (`sel` nulo) segue
  // sempre o relógio.
  const iSel = useMemo(() => {
    if (sel == null) return 0;
    if (sel.ms != null) return indiceHoraPorInstante(H, sel.ms, sel.i);
    return Math.max(0, Math.min(H.length - 1, sel.i));
  }, [H, sel]);
  const escolhe = useCallback(
    (j: number) => {
      const jj = Math.max(0, Math.min(H.length - 1, j));
      // a 1.ª barra com cobertura é «Agora»: escolhê-la volta a seguir o relógio
      if (jj === 0 && !dados.semAgora) {
        setSel(null);
        return;
      }
      const ms = H[jj]?.ms;
      setSel({ i: jj, ms: typeof ms === 'number' && Number.isFinite(ms) ? ms : null });
    },
    [H, dados.semAgora],
  );
  useEffect(() => {
    if (pendH == null || !H.length) return;
    escolhe(pendH);
    setPendH(null);
  }, [pendH, H.length, escolhe]);
  const muda = useCallback(
    (m: SpotModalidadeAtiva) => {
      setD(m);
      if (isModalidade(m)) gravarPrefModalidade(m);
      onModalidade?.(spotModParaSport(m));
    },
    [onModalidade],
  );

  const sport = spotModParaSport(d);
  const dBase = spotModParaBase(d);
  const nivelSpot = nivelDoSpot(spot, sport);
  const rSel = NS[iSel];
  const condicoesAcimaNivel =
    (nivel === 'beginner' || nivel === 'intermediate') &&
    (Boolean(rSel?.soProfissionais) || rSel?.seguranca === 'offshore' || rSel?.seguranca === 'side-offshore');
  const acimaNivel = !!nivel && (!spotDentroDoNivel(nivelSpot, nivel) || condicoesAcimaNivel);
  // sem nível: só a dica, e só num spot intermédio ou acima (o estudo §4); «Todos os níveis» e sem nível na ficha nunca
  const dicaNivel = !nivel && (nivelSpot === 'intermediate' || nivelSpot === 'advanced' || nivelSpot === 'expert');
  const tSel = H[iSel]?.t;
  const vizinhosNivel = useVizinhosNivel(spot, sport, nivel, tSel, acimaNivel, H[iSel]?.ms);

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
    ms: h.ms,
    ehAgora,
    d,
    sport,
    mares: dados.mares,
    citada: Number.isFinite(h.tide) ? dados.mares.find((m) => mareDepois(m, h)) : undefined,
    nivel,
  };
  const fotoHero = fotos[dBase] ?? fotos.surf ?? fotos.kite;
  const mostrarMaisModos = compativeis.length > opcoesTop.length;
  const localHero = !opcoesTop.includes(d) ? `${local} · ${copy.modalidades[d] ?? d}` : local;

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
        opcoes={opcoesTop}
        onModalidade={muda}
        nivel={nivel}
        onNivel={escolheNivel}
        cn={cn}
        menuNivel={menuNivel}
        onMenuNivel={setMenuNivel}
      />
      <SpotHero
        nome={nome}
        quando={{ local: localHero, dia: quandoDia, hora: horaTxt(copy, horaDe(h.t)), agora: ehAgora }}
        n={r.n}
        banda={b}
        palavra={palavra}
        resto={resto}
        apoio={f.l2}
        foto={fotoHero}
        locale={locale}
        copy={copy}
        faltaTxt={dados.semAgora ? copy.semPrevisao : null}
        semDados={!!r.semDados}
        aviso={
          acimaNivel || dicaNivel ? (
            <NivelAviso
              spot={spot}
              d={dBase}
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
          spotId={spot.id}
          locale={locale}
          mapaSport={sportParaMapa(getCompatibleSports(spot), d)}
          nome={nome}
          ll={[spot.lon, spot.lat]}
          idEstatico={!ed.estimado || GEO_ESTATICOS_EXTRAS.has(spot.id) ? spot.id : undefined}
          praiaVirada={ed.praiaVirada}
          aguaInterior={Boolean(ed.aguaInterior)}
          aguaPlana={ed.aguaPlana}
          ehNoite={temNoite}
          vizinhos={vizinhos}
          h={h}
          banda={b}
          d={dBase}
          copy={copy}
          forcarPlano={flags.plano}
          rotulos={ed.rotulos}
        />
      </div>
      {mostrarMaisModos ? (
        <div className="modos-extra" data-testid="spot-modos-extra">
          {compativeis.map((m) => (
            <button
              key={m}
              type="button"
              data-d={m}
              aria-pressed={d === m}
              onClick={() => {
                if (m !== d) muda(m);
              }}
            >
              {copy.modalidades[m] ?? m}
            </button>
          ))}
        </div>
      ) : null}
      {acoes}
      {estudo ? <div className="medesabe-fora">{estudo(hv)}</div> : null}
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
      {typeof contexto === 'function' ? contexto(hv) : contexto}
      <p className="falta-dados" data-testid="falta-dados">
        {[
          dados.faltam.includes('onda') && (d === 'surf' || d === 'bodyboard') ? copy.faltaOnda : null,
          dados.faltam.includes('agua') ? copy.faltaAgua : null,
          dados.faltam.includes('rain') ? copy.faltaChuvaNuvens : null,
        ]
          .filter(Boolean)
          .join(' ') || null}
      </p>
    </div>
  );
}
