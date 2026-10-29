'use client';

/**
 * Controlo do nível (#nivel-ui), ao lado do selector Kite · Surf na home
 * (`.hero-modo`) e no spot (`TopBar`). Um botão com o glifo das três ondas (e
 * o nome do nível) que abre um pequeno grupo de rádio: setas, Home/End, Esc e
 * clique fora fecham, e o foco volta ao botão. Os valores e a chave são os do
 * filtro do /mapa (`MAP_DIFFICULTY_OPTIONS`); «Todos» = sem nível.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { MapDifficultyFilter, NivelUtilizador } from '@/lib/mapDifficulty';
import type { NivelCopy } from '@/lib/translations/nivel';
import Ondas, { ondasDe } from './Ondas';

const OPCOES: MapDifficultyFilter[] = ['beginner', 'intermediate', 'advanced', 'all'];

export interface NivelControlProps {
  nivel: NivelUtilizador | null;
  onEscolhe: (v: MapDifficultyFilter) => void;
  copy: NivelCopy;
  /** Aberto controlado de fora (a dica do spot abre o menu); sem isto, o controlo guarda o seu. */
  aberto?: boolean;
  onAberto?: (v: boolean) => void;
}

export default function NivelControl({ nivel, onEscolhe, copy: c, aberto: abertoExt, onAberto }: NivelControlProps) {
  const [abertoInt, setAbertoInt] = useState(false);
  const aberto = abertoExt ?? abertoInt;
  const setAberto = useCallback(
    (v: boolean) => {
      setAbertoInt(v);
      onAberto?.(v);
    },
    [onAberto],
  );
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const atual: MapDifficultyFilter = nivel ?? 'all';

  // ao abrir, o foco vai para a opção marcada
  useEffect(() => {
    if (!aberto) return;
    const el = menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? menu.current?.querySelector<HTMLButtonElement>('[role="radio"]');
    el?.focus();
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [aberto, setAberto]);

  const fecha = () => {
    setAberto(false);
    botao.current?.focus();
  };
  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    const rs = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const k = rs.indexOf(document.activeElement as HTMLButtonElement);
    let j = -1;
    if (e.key === 'Escape') {
      e.preventDefault();
      fecha();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = (k + 1) % rs.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = (k + rs.length - 1) % rs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = rs.length - 1;
    else if (e.key === 'Tab') {
      setAberto(false);
      return;
    }
    if (j >= 0) {
      e.preventDefault();
      rs[j]?.focus();
    }
  };

  const nome = nivel ? c.nome[nivel] : null;
  return (
    <div className="nv" ref={raiz} data-testid="nivel">
      <button
        ref={botao}
        type="button"
        className={`nv-b${nivel ? '' : ' vazio'}`}
        aria-expanded={aberto}
        aria-controls={`${id}-m`}
        aria-label={c.botaoAria(nome)}
        data-nivel={nivel ?? ''}
        data-testid="nivel-botao"
        onClick={() => setAberto(!aberto)}
      >
        <Ondas n={ondasDe(nivel)} />
        <span className="nv-t" aria-hidden="true">
          {nivel ? (
            <>
              <span className="lg">{c.nome[nivel]}</span>
              <span className="ct">{c.nomeCurto[nivel]}</span>
            </>
          ) : (
            c.botao
          )}
        </span>
      </button>
      <div className="nv-m" id={`${id}-m`} ref={menu} hidden={!aberto} onKeyDown={teclas} data-testid="nivel-menu">
        <p className="nv-h" id={`${id}-h`}>
          {c.menuT}
        </p>
        <div role="radiogroup" aria-labelledby={`${id}-h`}>
          {OPCOES.map((o) => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={atual === o}
              tabIndex={atual === o ? 0 : -1}
              className={o === 'all' ? 'nv-todos' : undefined}
              data-v={o}
              onClick={() => {
                onEscolhe(o);
                fecha();
              }}
            >
              <Ondas n={ondasDe(o)} />
              <span>
                <b>{c.nome[o]}</b>
                <small>{c.desc[o]}</small>
              </span>
            </button>
          ))}
        </div>
        <p className="nv-p">{c.menuNota}</p>
      </div>
    </div>
  );
}
