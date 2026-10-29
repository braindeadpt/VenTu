/**
 * Estado da home v6 (#183) para uma modalidade, um «agora» e um bloco: tudo o
 * que a página pinta (palavra gigante, frase nacional, nº 1–3, régua, mapa)
 * sai daqui, de UMA chamada a `ranking()` por bloco (lista única). Os
 * componentes não fazem contas: só lêem este objecto.
 * Lógica da maquete aprovada (`docs/design/maquetes/v6-atlantico/index.html`:
 * `renderHero`, `renderOutros`, `renderRegua`, `renderLeg`).
 */
import { bandaRank, DA, type BandaK, type Modalidade } from '@/lib/modalidades';
import { spotDentroDoNivel, type MapDifficultyFilter } from '@/lib/mapDifficulty';
import { ehNoite, type Bloco, type Linha, type Modelo, type SpotHome } from './homeV6';

export type Palavra = 'vai' | 'da' | 'naoVai' | 'noite';

export interface CelulaRegua {
  id: string;
  n: number | null;
  b: BandaK;
  /** id do nº 1 desse bloco (o mesmo da lista). */
  spot: string;
  agora: boolean;
  /** posição da seta «agora» dentro do bloco actual (%), ou null */
  marca: number | null;
  rotulo: string;
  rotuloCurto: string;
  aria: string;
}

export interface EstadoHome {
  d: Modalidade;
  agoraI: number;
  blocos: Bloco[];
  noiteAgora: boolean;
  /** bloco escolhido (`null` = noite) */
  bloco: Bloco | null;
  /** bloco cujos dados se mostram (o escolhido, ou o próximo à noite) */
  dados: Bloco | null;
  /** id escolhido na régua («noite» incluído) */
  bId: string | null;
  noite: boolean;
  palavra: Palavra;
  /** banda da palavra e da página (a do nº 1; noite sem bloco) */
  banda: BandaK;
  frase: { txt: string; b: BandaK };
  quando: { dia: string; forte: string; resto: string };
  R: Linha[];
  top: Linha[];
  linhas: Array<{ l1: string; l2: string; pal: string | null; rk: string }>;
  heroSpot: string | null;
  rotulosTop: Linha[];
  regua: Array<{ dia: 0 | 1; rot: string; celulas: CelulaRegua[] }>;
  /** hora cujo vento e luz o mapa mostra */
  horaMapa: number;
  mapaQ: string;
  /**
   * Filtro de nível (#nivel-logica): o melhor spot da costa que ficou de
   * fora por estar acima do nível E não entra no top 3 mostrado (só se era
   * o nº 1 sem filtro), com a nota. No caso «poucos» o nº 1 sem filtro pode
   * voltar ao top marcado `acimaDoNivel` — aí já não é «fora».
   */
  fora?: Linha | null;
  /** Spots do nível a «dar» (n ≥ 5) e total de spots do nível na modalidade. */
  poucos?: { dar: number; total: number };
  /**
   * Com 0 spots do nível a «dar»: o primeiro bloco DEPOIS de `dados` em que
   * um spot do nível tem nota ≥ 5 (`null` se nunca) — nunca aponta para
   * trás da selecção.
   */
  proximoDoNivel?: { bloco: Bloco; linha: Linha } | null;
}

export function estadoHome(M: Modelo, d: Modalidade, agoraIn: number, bPedido: string | null, nivel?: MapDifficultyFilter | null): EstadoHome {
  const c = M.copy;
  const agoraI = Math.max(0, Math.min(M.NH - 1, agoraIn));
  const REF = M.spots.find((s) => s.id === 'guincho') ?? M.spots[0];
  const noiteAgora = REF ? ehNoite(REF.h[agoraI].sunEl) : false;
  const BL = M.blocos(agoraI);
  const prox = BL.find((b) => !b.passado) ?? null;
  const pedido = bPedido ? BL.find((b) => b.id === bPedido && !b.passado) : undefined;
  let bId: string | null;
  if (bPedido === 'noite' && noiteAgora) bId = 'noite';
  else bId = (pedido ?? BL.find((b) => b.atual) ?? (noiteAgora ? null : prox))?.id ?? (noiteAgora ? 'noite' : null);
  const bloco = bId && bId !== 'noite' ? (BL.find((b) => b.id === bId) ?? null) : null;
  const dados = bloco ?? prox;
  const nomeBloco = (b: Bloco) => c.nomeBloco(b.dia, b.k);

  const R = dados ? M.ranking(d, dados, agoraI) : [];

  /* Filtro de nível (#nivel-logica): mesma lista `R` — nenhuma nota é
   * recalculada; o nível só escolhe quem entra no top 3, na régua e no
   * «fora». `null`/`'all'` = o comportamento de sempre, byte a byte. */
  const nv = nivel && nivel !== 'all' ? nivel : null;
  const nivelDe = (sp: SpotHome) => sp.nivelPorModalidade?.[d] ?? sp.nivel;
  const dentroDo = (r: Linha) => spotDentroDoNivel(nivelDe(r.sp), nv ?? 'all');
  const aDar = (r: Linha) => (r.n ?? -1) >= DA;
  /** nº 1 de um bloco (filtrado pelo nível, se escolhido) — a régua e o 0-a-dar. */
  const primeiroDe = (b: Bloco) => {
    const RB = M.ranking(d, b, agoraI);
    return nv ? RB.find(dentroDo) : RB[0];
  };

  let top: Linha[];
  let fora: Linha | null | undefined;
  let poucos: { dar: number; total: number } | undefined;
  let proximoDoNivel: { bloco: Bloco; linha: Linha } | null | undefined;
  if (nv) {
    const dentro = R.filter(dentroDo);
    const acima = R.filter((r) => !dentroDo(r));
    const dar = dentro.filter(aDar).length;
    poucos = { dar, total: dentro.length };
    if (dar < 3) {
      if (dar === 0) {
        proximoDoNivel = null;
        // «próximo» é sempre a seguir ao bloco mostrado: `dados` é o bloco
        // seleccionado/actual e os anteriores não passados ficam antes dele.
        const depoisDe = dados ? BL.indexOf(dados) + 1 : BL.length;
        for (const b of BL.slice(depoisDe)) {
          const r1 = primeiroDe(b);
          if (r1 && aDar(r1)) {
            proximoDoNivel = { bloco: b, linha: r1 };
            break;
          }
        }
      }
      // «poucos» e «zero» (estudo aprovado): nº 1 = melhor do nível mesmo
      // fraco; depois os melhores da costa acima do nível a dar (marcados);
      // só na falta deles entram os seguintes do nível.
      top = dentro.slice(0, 1);
      for (const r of acima.filter(aDar)) {
        if (top.length >= 3) break;
        top.push({ ...r, acimaDoNivel: true, nCosta: R.indexOf(r) + 1 });
      }
      for (const r of dentro.slice(1)) {
        if (top.length >= 3) break;
        top.push(r);
      }
    } else {
      top = dentro.slice(0, 3);
    }
    // `fora` só quando o nº 1 sem filtro está acima do nível E não aparece
    // no top mostrado — no caso «poucos» pode voltar marcado acimaDoNivel.
    fora = R[0] && !dentroDo(R[0]) && !top.some((r) => r.sp.id === R[0].sp.id) ? R[0] : null;
  } else {
    top = R.slice(0, 3);
  }
  const t0 = top[0];
  const noite = !bloco;
  const palavra: Palavra = noite || !t0 ? 'noite' : bandaRank(t0.b) >= 3 ? 'vai' : bandaRank(t0.b) === 2 ? 'da' : 'naoVai';
  const banda: BandaK = noite || !t0 ? 'noite' : t0.b;
  const fN = dados ? M.nacional(d, dados, agoraI) : { txt: c.noiteNaCosta, b: 'noite' as BandaK };
  let txt = fN.txt;
  if (noite && dados) txt = c.comBloco(nomeBloco(dados), fN.corpo || txt);

  const dataDe = (i: number) => {
    const t = M.t(i);
    const wd = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10))).getUTCDay();
    return `${c.dias[wd]} ${+t.slice(8, 10)} ${c.meses[+t.slice(5, 7) - 1]}`;
  };
  const quando = !bloco
    ? { dia: dataDe(agoraI), forte: c.horaH(M.hh(agoraI)), resto: c.noiteRot }
    : bloco.atual
      ? { dia: dataDe(agoraI), forte: c.horaH(M.hh(agoraI)), resto: c.agora }
      : { dia: dataDe(bloco.a), forte: c.blocoNome[bloco.k], resto: c.intervalo(M.hh(bloco.a), M.hh(bloco.z) + 1) };

  const rkQ = bloco && bloco.atual ? c.agora : dados ? nomeBloco(dados) : c.agora;
  const linhas = dados
    ? top.map((r, k) => ({ ...M.linha(r, d, dados), rk: c.nRank(k + 1, rkQ) }))
    : [];

  const regua: EstadoHome['regua'] = [];
  for (const dia of [0, 1] as const) {
    const vis = BL.filter((b) => b.dia === dia && !b.passado);
    const celulas: CelulaRegua[] = vis.map((b) => {
      const r = primeiroDe(b);
      return {
        id: b.id,
        n: r?.n ?? null,
        b: r?.b ?? 'noite',
        spot: r?.sp.id ?? '',
        agora: b.atual,
        marca: b.atual ? +(((agoraI - b.a + 0.5) / (b.z - b.a + 1)) * 100).toFixed(1) : null,
        rotulo: b.atual ? c.agora : c.blocoNome[b.k],
        rotuloCurto: b.atual ? c.agora : c.blocoCurto[b.k],
        aria: r ? c.blocoAria(nomeBloco(b), b.atual, r.sp.nome, c.banda[r.b], r.n ?? 0) : nomeBloco(b),
      };
    });
    if (dia === 0 && noiteAgora && !vis.length)
      celulas.push({ id: 'noite', n: null, b: 'noite', spot: '', agora: true, marca: null, rotulo: c.noiteRot, rotuloCurto: c.noiteRot, aria: c.noiteAria });
    if (!celulas.length) continue;
    regua.push({ dia, rot: dia === 0 ? `${c.hoje}${!noiteAgora ? ' · ' + c.horaH(M.hh(agoraI)) : ''}` : c.amanha, celulas });
  }

  const horaMapa = !bloco ? agoraI : bloco.atual ? agoraI : bloco.luz;
  const mapaQ = '· ' + (bloco && bloco.atual ? c.agora : dados ? nomeBloco(dados) : c.agora);

  return {
    d,
    agoraI,
    blocos: BL,
    noiteAgora,
    bloco,
    dados,
    bId,
    noite,
    palavra,
    banda,
    frase: { txt, b: fN.b },
    quando,
    R,
    top,
    linhas,
    heroSpot: t0?.sp.id ?? null,
    rotulosTop: top,
    regua,
    horaMapa,
    mapaQ,
    ...(nv
      ? {
          fora: fora ?? null,
          poucos: poucos ?? { dar: 0, total: 0 },
          proximoDoNivel: proximoDoNivel ?? null,
        }
      : {}),
  };
}
