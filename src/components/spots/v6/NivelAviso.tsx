'use client';

/**
 * Aviso de nível no hero do spot v6 (#nivel-ui, estudo §4), dentro do bloco
 * `.ver`, ao lado da palavra e da frase:
 *  - spot acima do nível escolhido: a etiqueta «Spot para avançados» (pílula
 *    escura com contorno --sol, nunca vermelho), o porquê em linguagem simples
 *    (os perigos do spot) e as alternativas do nível ≤ 80 km (chips com a nota
 *    no desktop; «3 spots de iniciante perto ›» no telemóvel, para o
 *    «Do teu nível, perto daqui»);
 *  - sem nível e spot intermédio ou acima: só uma dica discreta que abre o menu;
 *  - spot do nível ou abaixo dele: nada (não se fala do que não é preciso).
 * A nota /10 nunca muda.
 */
import type { CSSProperties } from 'react';
import Ondas, { ondasDe } from '@/components/v6/Ondas';
import { bandaDe, type Modalidade } from '@/lib/modalidades';
import { bandaVars } from '@/lib/v6Tokens';
import { spotTagEn } from '@/lib/spotTagsEn';
import type { NivelUtilizador } from '@/lib/mapDifficulty';
import type { NivelCopy } from '@/lib/translations/nivel';
import type { VizinhoDoNivel } from '@/lib/vizinhosNivel';
import type { Spot } from '@/types';

export const PERTO_NIVEL_ID = 'perto-nivel';

/** O porquê do aviso a partir dos perigos da ficha (`hazards`), na língua da página. */
export function porqueNivel(spot: Pick<Spot, 'hazards'>, d: Modalidade, cn: NivelCopy): string {
  const p = cn.comPerigos === 'pt' ? spot.hazards ?? [] : cn.comPerigos === 'en' ? (spot.hazards ?? []).map(spotTagEn) : [];
  return cn.porque(p.slice(0, 4), d);
}

export interface NivelAvisoProps {
  spot: Spot;
  d: Modalidade;
  nivel: NivelUtilizador | null;
  /** Nível do spot nesta modalidade (`nivelDoSpot`). */
  nivelSpot: Spot['difficulty'];
  modo: 'acima' | 'dica';
  vizinhos: VizinhoDoNivel[];
  locale: string;
  cn: NivelCopy;
  onQualNivel: () => void;
}

export default function NivelAviso({ spot, d, nivel, nivelSpot, modo, vizinhos, locale, cn, onQualNivel }: NivelAvisoProps) {
  if (modo === 'dica') {
    return (
      <div className="nv-av" data-testid="spot-nivel" data-estado="dica">
        <p className="dica">
          <Ondas n={ondasDe(nivelSpot)} />
          <span>{cn.dica(nivelSpot, d)}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onQualNivel();
            }}
          >
            {cn.qualNivel}
          </button>
        </p>
      </div>
    );
  }
  if (!nivel) return null;
  const isPt = locale === 'pt';
  return (
    <div className="nv-av" data-testid="spot-nivel" data-estado="acima">
      <span className="nv-tag" role="note">
        <Ondas n={ondasDe(nivelSpot)} />
        {cn.tag(nivelSpot)}
      </span>
      <p className="porq">
        {porqueNivel(spot, d, cn)} <span>{cn.escolheste(nivel)}</span>
      </p>
      <p className="alt" data-testid="spot-nivel-alt">
        {vizinhos.length ? (
          <>
            <span className="chips">
              <span>{cn.pertoChips}</span>
              {vizinhos.map((v) => (
                <a key={v.spot.id} className="ch" href={`/${locale}/spots/${v.spot.slug}/?d=${d}`} data-spot={v.spot.id}>
                  {isPt ? v.spot.name : v.spot.nameEn || v.spot.name}
                  {typeof v.nota === 'number' ? (
                    <span className="nota" style={bandaVars(bandaDe(v.nota)) as CSSProperties}>
                      {v.nota}
                    </span>
                  ) : null}
                </a>
              ))}
            </span>
            <a className="m" href={`#${PERTO_NIVEL_ID}`}>
              {cn.pertoLink(vizinhos.length, nivel)}
            </a>
            <span className="m" aria-hidden="true">
              {' ›'}
            </span>
          </>
        ) : (
          <>
            <span>{cn.nenhumPerto(nivel)} </span>
            <a href={`/${locale}/`}>{cn.verCosta}</a>
          </>
        )}
      </p>
    </div>
  );
}
