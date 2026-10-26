'use client';

import { scoreToNota } from '@/lib/nota';
import type L from 'leaflet';
import { getScoreRgb } from '@/lib/scoreThresholds';
import { MAP_NIGHT_FILL, MAP_NIGHT_INK, MAP_NIGHT_MOON_PATH, mapNightCopy } from '@/lib/mapNight';

/**
 * SVG arc path for a circle segment.
 */
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const rad = (angle: number) => ((angle - 90) * Math.PI) / 180;
  const polar = (a: number) => ({ x: cx + r * Math.cos(rad(a)), y: cy + r * Math.sin(rad(a)) });
  const start = polar(endAngle);
  const end = polar(startAngle);
  const sweep = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${sweep} 0 ${end.x} ${end.y}`;
}

export interface ClusterIconOptions {
  /** Skip score arcs — much cheaper on mobile (count only). */
  simple?: boolean;
  locale?: string;
  /** O que o cluster agrupa — spots de surf ou locais do directorio. */
  kind?: 'spots' | 'places';
}

/**
 * Melhor score dos filhos do cluster — `spotScore` já reflecte o desporto e
 * a hora da camada 48h. null quando nenhum filho tem score (ex. directorio).
 */
export function bestClusterScore(markers: { spotScore?: number }[]): number | null {
  let best: number | null = null;
  for (const m of markers) {
    if (typeof m.spotScore === 'number' && (best === null || m.spotScore > best)) {
      best = m.spotScore;
    }
  }
  return best;
}

/**
 * Cluster de noite (#218 D3): TODOS os filhos estão numa frame em que o v6 não
 * dá nota. Basta um filho com nota para o cluster mostrar o melhor numérico
 * desses (bestClusterScore já ignora os de noite — não têm spotScore).
 */
export function isNightCluster(markers: ReadonlyArray<{ spotNight?: boolean; spotScore?: number }>): boolean {
  return markers.length > 0 && markers.every((m) => m.spotNight === true);
}

/**
 * Estilo inline de texto so-para-leitores-de-ecra.
 *
 * O HTML do cluster e injectado pelo Leaflet via innerHTML, portanto o JIT do
 * Tailwind nunca o le: depender da classe `sr-only` seria depender de outro
 * componente a continuar a usa-la. Inline nao tem esse acoplamento.
 */
/** Sequência dos ids de clipPath dos clusters (ver clipId). */
let clusterClipSeq = 0;

const SR_ONLY_STYLE =
  'position:absolute;width:1px;height:1px;padding:0;margin:-1px;' +
  'overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';

type ClusterLocale = 'pt' | 'en' | 'es' | 'de' | 'fr';

function clusterLocale(locale: string): ClusterLocale {
  const l = locale.toLowerCase().slice(0, 2);
  return l === 'pt' || l === 'es' || l === 'de' || l === 'fr' ? l : 'en';
}

const AREA_PHRASE: Record<ClusterLocale, Record<'spots' | 'places', string>> = {
  pt: { spots: 'spots nesta zona — ampliar', places: 'locais nesta zona — ampliar' },
  en: { spots: 'spots in this area — zoom in', places: 'places in this area — zoom in' },
  es: { spots: 'spots en esta zona — ampliar', places: 'lugares en esta zona — ampliar' },
  de: { spots: 'Spots in dieser Zone — vergrößern', places: 'Orte in dieser Zone — vergrößern' },
  fr: { spots: 'spots dans cette zone — zoomer', places: 'lieux dans cette zone — zoomer' },
};

const BEST_SCORE_PHRASE: Record<ClusterLocale, string> = {
  pt: 'Melhor nota',
  en: 'Best rating',
  es: 'Mejor nota',
  de: 'Beste Note',
  fr: 'Meilleure note',
};

/**
 * Nome acessivel do cluster.
 *
 * O leaflet.markercluster da role="button" ao icone, e um botao precisa de
 * nome. Os números vivem em <text> de SVG (que o axe nao conta como texto
 * acessivel) ou em divs onde o nome seria so «80» — sem dizer 80 do que,
 * nem que ha uma accao. Dai a etiqueta explicita, escondida visualmente:
 * «Melhor nota 8/10 · 12 spots nesta zona — ampliar».
 */
export function clusterLabel(
  total: number,
  bestScore: number | null,
  locale: string,
  kind: 'spots' | 'places',
  night = false,
): string {
  const l = clusterLocale(locale);
  const base = `${total} ${AREA_PHRASE[l][kind]}`;
  // «noite, sem nota · 12 spots nesta zona — ampliar»
  if (kind === 'spots' && night) return `${mapNightCopy(locale).aria} · ${base}`;
  if (kind === 'spots' && bestScore !== null) {
    return `${BEST_SCORE_PHRASE[l]} ${scoreToNota(bestScore)}/10 · ${base}`;
  }
  return base;
}

export function createClusterIconFunction(
  L: typeof import('leaflet'),
  options: ClusterIconOptions = {},
): (cluster: L.MarkerCluster) => L.DivIcon {
  const simple = options.simple === true;
  const locale = options.locale ?? 'pt';
  const kind = options.kind ?? 'spots';

  return function (cluster: L.MarkerCluster) {
    const markers = cluster.getAllChildMarkers() as (L.Marker & { spotScore?: number; spotNight?: boolean })[];
    const total = markers.length;
    // kind 'places' nunca tem spotScore → bestScore null → aspecto de hoje.
    const bestScore = kind === 'spots' ? bestClusterScore(markers) : null;
    const night = kind === 'spots' && isNightCluster(markers);
    const scoreColor = bestScore === null ? null : getScoreRgb(bestScore);
    const size = total < 10 ? 44 : total < 100 ? 52 : 60;
    const fontSize = total < 10 ? 12 : total < 100 ? 14 : 16;
    const c = size / 2;
    const label = clusterLabel(total, bestScore, locale, kind, night);

    // Squircle (não círculo): distingue o cluster do pin de score. O número
    // principal é o MELHOR score (cor do tier — mesma linguagem dos pins);
    // a contagem vive num badge pequeno no canto (convenção badge = N itens).
    const countBadge = `
      <span data-cluster-count aria-hidden="true" style="position:absolute;top:-4px;right:-4px;
        min-width:16px;height:16px;padding:0 3px;border-radius:999px;
        display:flex;align-items:center;justify-content:center;
        background:rgb(var(--bg-elevated));border:1.5px solid rgb(var(--divider-strong));
        font-family:var(--font-geist-mono),'Geist Mono',ui-monospace,monospace;
        font-size:9px;font-weight:700;line-height:1;color:rgb(var(--fg-muted))">${total}</span>`;

    // Todos de noite: squircle no fill v6 `noite` com a lua — sem número.
    if (night) {
      const moon = Math.round(size * 0.4);
      const html = `
        <span style="${SR_ONLY_STYLE}">${label}</span>
        <div aria-hidden="true" data-cluster-night="true" style="position:relative;width:${size}px;height:${size}px;border-radius:34%;
          display:flex;align-items:center;justify-content:center;
          background:${MAP_NIGHT_FILL};border:2px solid rgb(var(--divider-strong));
          box-shadow:0 1px 4px rgb(0 0 0 / 0.12)">
          <svg width="${moon}" height="${moon}" viewBox="0 0 24 24" aria-hidden="true"><path d="${MAP_NIGHT_MOON_PATH}" fill="${MAP_NIGHT_INK}"/></svg>${countBadge}
        </div>
      `;
      return L.divIcon({
        className: 'ventu-cluster-icon',
        html,
        iconSize: [size, size],
        iconAnchor: [c, c],
      });
    }

    if (simple) {
      const html = `
        <span style="${SR_ONLY_STYLE}">${label}</span>
        <div aria-hidden="true" style="position:relative;width:${size}px;height:${size}px;border-radius:34%;
          display:flex;align-items:center;justify-content:center;
          background:rgb(var(--bg-elevated));border:2px solid rgb(var(--divider-strong));
          font-family:var(--font-geist-mono),'Geist Mono',ui-monospace,monospace;
          font-size:${fontSize}px;font-weight:700;color:rgb(var(--fg));
          box-shadow:0 1px 4px rgb(0 0 0 / 0.12)">
          ${
            bestScore === null
              ? total
              : `<span data-cluster-score style="color:${scoreColor}">${scoreToNota(bestScore)}</span>${countBadge}`
          }
        </div>
      `;
      return L.divIcon({
        className: 'ventu-cluster-icon',
        html,
        iconSize: [size, size],
        iconAnchor: [c, c],
      });
    }

    let goodCount = 0;
    let fairCount = 0;
    let poorCount = 0;
    let nightCount = 0;

    markers.forEach((m) => {
      // Noite não é «fraco»: fatia própria no fill `noite`.
      if (m.spotNight) { nightCount++; return; }
      const score = typeof m.spotScore === 'number' ? m.spotScore : 0;
      if (score >= 60) goodCount++;
      else if (score >= 40) fairCount++;
      else poorCount++;
    });

    // Silhueta squircle + anel de scores interior: a forma separa o cluster
    // do pin circular («score»), e o donut mantém a proporção
    // bom/razoável/fraco sem ocupar a margem.
    const faceInset = 3;
    const faceSize = size - faceInset * 2;
    const faceRx = faceSize * 0.32;
    const arcR = c - 10;
    const innerR = arcR - 5;
    const arcs: { color: string; path: string }[] = [];

    if (total > 0) {
      const degreesPerSpot = 360 / total;
      let currentAngle = -90;
      const addArc = (count: number, color: string) => {
        if (count <= 0) return;
        const segDeg = count * degreesPerSpot;
        const endAngle = currentAngle + segDeg;
        if (segDeg > 0.5) {
          arcs.push({
            color,
            path: describeArc(c, c, arcR, currentAngle, endAngle),
          });
        }
        currentAngle = endAngle;
      };
      addArc(goodCount, 'rgb(var(--score-good))');
      addArc(fairCount, 'rgb(var(--score-fair))');
      addArc(poorCount, 'rgb(var(--score-poor))');
      addArc(nightCount, MAP_NIGHT_FILL);
    }

    const svgArcs = arcs
      .map((a) => `<path d="${a.path}" stroke="${a.color}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`)
      .join('');

    // Badge da contagem no canto superior direito — dentro do viewBox mas a
    // cavalgar a borda do squircle. Renderizado por cima dos arcos.
    const badgeR = 9;
    // id do clipPath único por ícone: derivá-lo das contagens repetia o
    // mesmo id (até 7× num documento — mega audit 26 set). Só corre no
    // cliente (iconCreateFunction do Leaflet), por isso não há hidratação.
    const clipId = `cluster-clip-${++clusterClipSeq}`;
    const badgeFont = String(total).length > 2 ? 7.5 : 8.5;
    const badge =
      bestScore === null
        ? ''
        : `
        <circle cx="${size - 9}" cy="9" r="${badgeR}"
          fill="rgb(var(--bg-elevated))" stroke="rgb(var(--divider-strong))" stroke-width="1.5" />
        <text data-cluster-count x="${size - 9}" y="9" text-anchor="middle" dominant-baseline="central"
          font-family="var(--font-geist-mono), 'Geist Mono', ui-monospace, monospace"
          font-size="${badgeFont}" font-weight="700" fill="rgb(var(--fg-muted))">${total}</text>`;

    const html = `
      <span style="${SR_ONLY_STYLE}">${label}</span>
      <svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id="${clipId}">
            <circle cx="${c}" cy="${c}" r="${innerR}" />
          </clipPath>
        </defs>
        <rect x="${faceInset}" y="${faceInset}" width="${faceSize}" height="${faceSize}" rx="${faceRx}"
          fill="rgb(var(--bg-elevated))" stroke="rgb(var(--divider-strong))" stroke-width="1.5" />
        <circle cx="${c}" cy="${c}" r="${arcR}" fill="none" stroke="rgb(var(--divider))" stroke-width="3" />
        ${svgArcs}
        <circle cx="${c}" cy="${c}" r="${innerR}" fill="rgb(var(--surface-1-rgb) / 0.08)" />
        <text ${bestScore === null ? '' : 'data-cluster-score '}x="${c}" y="${c + 1}" text-anchor="middle" dominant-baseline="central"
          font-family="var(--font-geist-mono), 'Geist Mono', ui-monospace, monospace"
          font-size="${fontSize}" font-weight="700"
          fill="${bestScore === null ? 'rgb(var(--fg))' : scoreColor}"
          clip-path="url(#${clipId})"
        >${bestScore === null ? total : scoreToNota(bestScore)}</text>
        ${badge}
      </svg>
    `;

    return L.divIcon({
      className: 'ventu-cluster-icon',
      html,
      iconSize: [size, size],
      iconAnchor: [c, c],
    });
  };
}
