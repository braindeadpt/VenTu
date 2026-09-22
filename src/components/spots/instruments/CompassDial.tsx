'use client';

import type { CSSProperties, ReactNode } from 'react';
import { svgUnit } from '@/lib/svgUnit';
import type { Sector } from '@/lib/instruments/sector';

/**
 * Rosa dos instrumentos (secção 4 — docs/design/SPOT-PAGE.md).
 * Gramática da maquete painel-guincho.html sobre a convenção das rosas
 * existentes (WindCompass/SwellRadar): direcções meteorológicas «de onde
 * vem», 0° = N em cima; a meia-lua tracejada é a TERRA (o lado oposto a
 * `coastOrientation`, que aponta para o mar).
 *
 * viewBox 220×220, C=110, R=80. O feixe roda num grupo `.rot` por
 * transform com ângulo unwrapped (ver unwrapAngle). Todas as coordenadas
 * trigonométricas passam por svgUnit() — guarda de hidratação React #418.
 */

const C = 110;
const R = 80;

function pt(r: number, deg: number): [number, number] {
  const t = (deg * Math.PI) / 180;
  return [svgUnit(C + r * Math.sin(t)), svgUnit(C - r * Math.cos(t))];
}

function arcPath(r: number, a0: number, a1: number): string {
  const [x0, y0] = pt(r, a0);
  const [x1, y1] = pt(r, a1);
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

export interface CompassDialProps {
  /** Id único do pattern de hatch (useId no chamador — ids SVG são globais). */
  hatchId: string;
  /** Normal da costa a apontar para o mar (graus). Sem ela não há meia-lua. */
  coastOrientation?: number;
  /** Sector ideal [a0, a1] em graus (idealSector) — arco grosso. */
  ideal?: Sector | null;
  labels: { sea: string; land: string };
  /** Conteúdo dentro do grupo rotativo (cone + pulsos + ponto). */
  beam: ReactNode;
  /** Rotação do feixe em graus, já unwrapped. */
  rotationDeg: number;
  /** Classe do grupo interno: oscilação do vento ('wob') ou pulso de onda. */
  beamClassName?: string;
  /** Vars CSS do feixe (--amp da oscilação, --per do pulso). */
  beamStyle?: CSSProperties;
}

export default function CompassDial({
  hatchId,
  coastOrientation,
  ideal,
  labels,
  beam,
  rotationDeg,
  beamClassName,
  beamStyle,
}: CompassDialProps) {
  const coast = coastOrientation;
  const [ax, ay] = coast !== undefined ? pt(R, coast + 90) : [0, 0];
  const [bx, by] = coast !== undefined ? pt(R, coast + 270) : [0, 0];
  const [lx, ly] = coast !== undefined ? pt(44, coast + 180) : [0, 0];
  const [mx, my] = coast !== undefined ? pt(46, coast) : [0, 0];

  return (
    <svg
      className="ventu-inst-fig block aspect-square w-full max-w-[128px] min-[760px]:max-w-[250px] justify-self-center overflow-visible"
      viewBox="0 0 220 220"
      aria-hidden="true"
      focusable="false"
    >
      {coast !== undefined && (
        <defs>
          <pattern
            id={hatchId}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line className="ventu-inst-hatch" x1="0" y1="0" x2="0" y2="5" />
          </pattern>
        </defs>
      )}
      {coast !== undefined && (
        <path
          fill={`url(#${hatchId})`}
          d={`M${C} ${C} L${ax} ${ay} A${R} ${R} 0 0 1 ${bx} ${by} Z`}
        />
      )}
      {coast !== undefined && (
        <line className="ventu-inst-coast" x1={ax} y1={ay} x2={bx} y2={by} />
      )}
      <circle className="ventu-inst-ring" cx={C} cy={C} r={R} />
      {Array.from({ length: 16 }, (_, i) => {
        const d = i * 22.5;
        const major = i % 4 === 0;
        const [x1, y1] = pt(R, d);
        const [x2, y2] = pt(major ? R - 9 : R - 5, d);
        return (
          <line
            key={d}
            className={major ? 'ventu-inst-tick' : 'ventu-inst-tick ventu-inst-tick-min'}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
          />
        );
      })}
      {ideal && <path className="ventu-inst-ideal" d={arcPath(R, ideal[0], ideal[1])} />}
      {['N', 'E', 'S', 'W'].map((l, i) => {
        const [x, y] = pt(R + 14, i * 90);
        return (
          <text
            key={l}
            className="ventu-inst-fig-text"
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {l}
          </text>
        );
      })}
      {coast !== undefined && (
        <>
          <text
            className="ventu-inst-fig-text ventu-inst-fig-label"
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {labels.land}
          </text>
          <text
            className="ventu-inst-fig-text ventu-inst-fig-label"
            x={mx}
            y={my}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {labels.sea}
          </text>
        </>
      )}
      <g
        className="ventu-inst-rot"
        style={{ transform: `rotate(${rotationDeg}deg)` }}
        data-beam
      >
        <g className={beamClassName} style={beamStyle}>
          {beam}
        </g>
      </g>
      <circle className="ventu-inst-hub" cx={C} cy={C} r={3.2} />
    </svg>
  );
}

/** Cone do feixe (a ponta fica na direcção «de onde vem»). */
export function BeamCone() {
  const r = R - 3;
  const [x0, y0] = pt(r, -12);
  const [x1, y1] = pt(r, 12);
  return (
    <path
      className="ventu-inst-cone"
      d={`M${C} ${C} L${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1} Z`}
    />
  );
}

/** Ponto na ponta do feixe (origem do vento/onda). */
export function BeamSource() {
  const [x, y] = pt(R - 3, 0);
  return <circle className="ventu-inst-src" cx={x} cy={y} r={3.2} />;
}

/** Anéis de pulso da onda (3 arcos ao ritmo do período). */
export function SwellPulses() {
  const d = arcPath(R - 3, -10, 10);
  return (
    <>
      <path className="ventu-inst-pulse" d={d} />
      <path className="ventu-inst-pulse ventu-inst-pulse-2" d={d} />
      <path className="ventu-inst-pulse ventu-inst-pulse-3" d={d} />
    </>
  );
}
