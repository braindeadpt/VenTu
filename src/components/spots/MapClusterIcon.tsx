'use client';

import type L from 'leaflet';

const HOUR_MS = 3_600_000;

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

export function createClusterIconFunction(
  L: typeof import('leaflet'),
): (cluster: L.MarkerCluster) => L.DivIcon {
  return function (cluster: L.MarkerCluster) {
    const markers = cluster.getAllChildMarkers();
    let goodCount = 0;
    let fairCount = 0;
    let poorCount = 0;

    markers.forEach((m: any) => {
      const score = typeof m.spotScore === 'number' ? m.spotScore : 0;
      if (score >= 60) goodCount++;
      else if (score >= 40) fairCount++;
      else poorCount++;
    });

    const total = goodCount + fairCount + poorCount;
    const size = total < 10 ? 44 : total < 100 ? 52 : 60;
    const fontSize = total < 10 ? 12 : total < 100 ? 14 : 16;
    const c = size / 2;
    const arcR = c - 4;
    const innerR = c * 0.72; // radius of the label circle

    // Build arc segments. Each segment goes clockwise from its start to end.
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
    }

    // SVG: background circle + number + arcs
    const svgArcs = arcs
      .map((a) => `<path d="${a.path}" stroke="${a.color}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`)
      .join('');

    const html = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id="cluster-clip-${total}-${goodCount}">
            <circle cx="${c}" cy="${c}" r="${innerR}" />
          </clipPath>
        </defs>
        <!-- Outer ring track -->
        <circle cx="${c}" cy="${c}" r="${arcR}" fill="none" stroke="rgb(var(--divider))" stroke-width="3.5" />
        <!-- Score segments -->
        ${svgArcs}
        <!-- Inner neutral fill -->
        <circle cx="${c}" cy="${c}" r="${innerR}" fill="rgb(var(--surface-1-rgb) / 0.08)" />
        <!-- Count number clipped to inner circle -->
        <text x="${c}" y="${c + 1}" text-anchor="middle" dominant-baseline="central"
          font-family="var(--font-geist-mono), 'Geist Mono', ui-monospace, monospace"
          font-size="${fontSize}" font-weight="700"
          fill="rgb(var(--fg))"
          clip-path="url(#cluster-clip-${total}-${goodCount})"
        >${total}</text>
      </svg>
      <div style="display:none;">
        <span class="ventu-cluster-good">${goodCount}</span>
        <span class="ventu-cluster-fair">${fairCount}</span>
        <span class="ventu-cluster-poor">${poorCount}</span>
      </div>
    `;

    return L.divIcon({
      className: 'ventu-cluster-icon',
      html,
      iconSize: [size, size],
      iconAnchor: [c, c],
    });
  };
}
