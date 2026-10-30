/**
 * O nível na home v6 (#nivel-ui): só leitura do `EstadoHome` que o motor já
 * devolve com o nível (`top`, `fora`, `poucos`, `proximoDoNivel`,
 * `acimaDoNivel`, `nCosta`). Aqui ficam só as palavras: a frase do nível nos
 * casos «poucos» e «zero» e o rótulo `rk` dos cartões. Nenhuma nota é
 * recalculada e nenhum ranking é refeito.
 */
import { DA, type Modalidade } from '@/lib/modalidades';
import { spotDentroDoNivel, type NivelUtilizador } from '@/lib/mapDifficulty';
import type { EstadoHome } from '@/lib/home/estadoHome';
import type { Linha, SpotHome } from '@/lib/home/homeV6';
import type { HomeV6Copy } from '@/lib/translations/homeV6';
import type { NivelCopy } from '@/lib/translations/nivel';
import type { BandaK } from '@/lib/modalidades';

/** Nível do spot na modalidade (a sobreposição por modalidade ganha à `difficulty`). */
export const nivelDoSpotHome = (sp: SpotHome, d: Modalidade) => sp.nivelPorModalidade?.[d] ?? sp.nivel;

/** «agora» / «amanhã de manhã»: o mesmo `rkQ` que o `estadoHome` usa no «nº k …». */
export function quandoDe(E: EstadoHome, c: HomeV6Copy): string {
  return E.bloco && E.bloco.atual ? c.agora : E.dados ? c.nomeBloco(E.dados.dia, E.dados.k) : c.agora;
}

/** Há poucos (0–2) spots do nível a «dar»: aviso, frase do nível e cartões marcados. */
export const emPoucos = (E: EstadoHome) => !!E.poucos && E.poucos.dar < 3;

const nomeC = (r: Linha) => r.sp.curto || r.sp.nome;

/** A frase do nível que substitui a nacional em «poucos» e «zero» (null nos outros casos). */
export function fraseNivel(E: EstadoHome, nivel: NivelUtilizador | null, c: HomeV6Copy, cn: NivelCopy): { txt: string; b: BandaK } | null {
  const t0 = E.top[0];
  if (!nivel || !E.poucos || !emPoucos(E) || !t0) return null;
  const q = quandoDe(E, c);
  const banda = c.banda[t0.b].toLowerCase();
  // «só a Arrifana dá …: dá.» repetia o verbo: na banda «dá» a frase fica sem chip
  const semChip = t0.b === 'da';
  const ok = E.R.filter((r) => spotDentroDoNivel(nivelDoSpotHome(r.sp, E.d), nivel) && (r.n ?? -1) >= DA);
  const txt =
    !ok.length
      ? cn.fraseZero(nivel, E.d, q, nomeC(t0), banda)
      : ok.length === 1
        ? cn.fraseUm(nivel, q, nomeC(ok[0]), semChip ? null : banda)
        : cn.fraseDois(nivel, q, nomeC(ok[0]), nomeC(ok[1]), semChip ? null : banda);
  return { txt, b: t0.b };
}

/** O `rk` de um cartão: «nº N da costa agora» quando está acima do nível; senão o do motor. */
export function rkDe(E: EstadoHome, r: Linha, rkMotor: string, c: HomeV6Copy, cn: NivelCopy): string {
  return r.acimaDoNivel && r.nCosta ? cn.nCosta(r.nCosta, quandoDe(E, c)) : rkMotor;
}
