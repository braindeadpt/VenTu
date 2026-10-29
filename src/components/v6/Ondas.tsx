/**
 * Glifo do nível (#nivel-ui, maquete `work/maquete-nivel`): três ondas
 * empilhadas, a de baixo = iniciante, acesas a `--sol` até ao nível.
 * Nunca vermelho nem triângulo: o nível avisa, não alarma.
 */
import type { Spot } from '@/types';
import type { MapDifficultyFilter } from '@/lib/mapDifficulty';

const DEGRAU: Record<string, 0 | 1 | 2 | 3> = { beginner: 1, intermediate: 2, advanced: 3, expert: 3 };

/** Ondas acesas para um nível (do utilizador ou do spot); «Todos»/sem nível = 0. */
export function ondasDe(lv: Spot['difficulty'] | MapDifficultyFilter | null | undefined): 0 | 1 | 2 | 3 {
  return lv ? (DEGRAU[lv] ?? 0) : 0;
}

export default function Ondas({ n, className }: { n: 0 | 1 | 2 | 3; className?: string }) {
  return (
    <svg
      className={`ondas${className ? ' ' + className : ''}`}
      data-n={n}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path className="o3" d="M3.5 6.5c2.8-2.6 5.7-2.6 8.5 0s5.7 2.6 8.5 0" />
      <path className="o2" d="M3.5 12c2.8-2.6 5.7-2.6 8.5 0s5.7 2.6 8.5 0" />
      <path className="o1" d="M3.5 17.5c2.8-2.6 5.7-2.6 8.5 0s5.7 2.6 8.5 0" />
    </svg>
  );
}
