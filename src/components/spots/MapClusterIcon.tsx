'use client';

import type L from 'leaflet';

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
}

export function createClusterIconFunction(
  L: typeof import('leaflet'),
  options: ClusterIconOptions = {},
): (cluster: L.MarkerCluster) => L.DivIcon {
  const simple = options.simple === true;

  return function (cluster: L.MarkerCluster) {
    const markers = cluster.getAllChildMarkers();
    const total = markers.length;
    const size = total < 10 ? 44 : total < 100 ? 52 : 60;
    const fontSize = total < 10 ? 12 : total < 100 ? 14 : 16;
    const c = size / 2;

    if (simple) {
      const html = `
        <div style="width:${size}px;height:${size}px;border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          background:rgb(var(--bg-elevated));border:2px solid rgb(var(--divider-strong));
          font-family:var(--font-geist-mono),'Geist Mono',ui-monospace,monospace;
          font-size:${fontSize}px;font-weight:700;color:rgb(var(--fg));
          box-shadow:0 1px 4px rgb(0 0 0 / 0.12)">
          ${total}
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

    markers.forEach((m: L.Marker & { spotScore?: number }) => {
      const score = typeof m.spotScore === 'number' ? m.spotScore : 0;
      if (score >= 60) goodCount++;
      else if (score >= 40) fairCount++;
      else poorCount++;
    });

    const arcR = c - 4;
    const innerR = c * 0.72;
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
        <circle cx="${c}" cy="${c}" r="${arcR}" fill="none" stroke="rgb(var(--divider))" stroke-width="3.5" />
        ${svgArcs}
        <circle cx="${c}" cy="${c}" r="${innerR}" fill="rgb(var(--surface-1-rgb) / 0.08)" />
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
