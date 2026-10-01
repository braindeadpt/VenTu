import { describe, expect, it } from 'vitest';
import {
  MARKER_LOD_ZOOM_SPLIT,
  MARKER_INK_CLOSED,
  SCORE_TIER_HEX_DARK,
  SCORE_TIER_HEX_LIGHT,
  buildV3DotIcon,
  buildV3MarkerIcon,
  contrastRatio,
  markerCollisionRadiusPx,
  markerScoreInkCss,
  markerScoreInkHex,
  planMarkerLayout,
  relativeLuminance,
  v3LodKey,
  type MarkerLayoutItem,
} from '../mapMarkers';

const item = (id: string, x: number, y: number, score: number): MarkerLayoutItem => ({
  id,
  x,
  y,
  score,
});

describe('markerCollisionRadiusPx — maquete recluster()', () => {
  it('abaixo de z8.5: 44 px em mobile (desvio M4: 52 dava <8 completos a z6), 40 px em desktop', () => {
    expect(markerCollisionRadiusPx(6, true)).toBe(44);
    expect(markerCollisionRadiusPx(8.49, true)).toBe(44);
    expect(markerCollisionRadiusPx(7, false)).toBe(40);
  });

  it('a partir de z8.5: 38 px nas duas superfícies', () => {
    expect(markerCollisionRadiusPx(MARKER_LOD_ZOOM_SPLIT, true)).toBe(38);
    expect(markerCollisionRadiusPx(12, false)).toBe(38);
  });
});

describe('planMarkerLayout — colocação por colisão (recluster da maquete)', () => {
  it('spots afastados ficam todos marcadores completos', () => {
    const out = planMarkerLayout(
      [item('a', 0, 0, 50), item('b', 200, 0, 90), item('c', 0, 300, 70)],
      40,
    );
    expect(out.every((e) => e.kind === 'full')).toBe(true);
    expect(out.every((e) => e.memberIds.length === 1)).toBe(true);
  });

  it('o representante do grupo é o de MAIOR score, os outros viram pontos', () => {
    // b é o melhor embora venha depois — tem de ganhar o grupo.
    const out = planMarkerLayout(
      [item('a', 0, 0, 40), item('b', 10, 10, 95), item('c', 20, 0, 60)],
      40,
    );
    const rep = out.find((e) => e.kind === 'full');
    expect(rep?.id).toBe('b');
    expect(rep?.memberIds.sort()).toEqual(['a', 'b', 'c']);
    const dots = out.filter((e) => e.kind === 'dot').map((e) => e.id);
    expect(dots.sort()).toEqual(['a', 'c']);
  });

  it('os pontos vêm primeiro — ficam por baixo dos marcadores completos', () => {
    const out = planMarkerLayout(
      [item('a', 0, 0, 90), item('b', 10, 0, 50), item('far', 500, 500, 10)],
      40,
    );
    const kinds = out.map((e) => e.kind);
    const firstFull = kinds.indexOf('full');
    expect(kinds.slice(0, firstFull).every((k) => k === 'dot')).toBe(true);
    expect(kinds.slice(firstFull).every((k) => k === 'full')).toBe(true);
  });

  it('marcadores completos nunca se sobrepõem (distância ≥ raio)', () => {
    // Cadeia: a-b colidem, b-c colidem, a-c não — greedy captura b em a.
    const items = [
      item('a', 0, 0, 90),
      item('b', 30, 0, 80),
      item('c', 60, 0, 85),
      item('d', 90, 30, 70),
      item('e', 120, 0, 60),
    ];
    const out = planMarkerLayout(items, 40);
    const fulls = out.filter((e) => e.kind === 'full').map((e) => items.find((i) => i.id === e.id)!);
    for (let i = 0; i < fulls.length; i++) {
      for (let j = i + 1; j < fulls.length; j++) {
        const dx = fulls[i].x - fulls[j].x;
        const dy = fulls[i].y - fulls[j].y;
        expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(40);
      }
    }
  });

  it('a fronteira é estrita: exactamente no raio NÃO colide', () => {
    const out = planMarkerLayout([item('a', 0, 0, 90), item('b', 40, 0, 50)], 40);
    expect(out.filter((e) => e.kind === 'full')).toHaveLength(2);
  });

  it('métrica Chebyshev: a diagonal a distância euclidiana > raio colide (bbox segura)', () => {
    // dx=32, dy=28 → hypot 42.5 > 40 (euclidiano não colidia → rects de
    // 34 px intersectavam-se 2×6). Chebyshev: max(32,28)=32 < 40 → colide.
    const out = planMarkerLayout([item('a', 0, 0, 90), item('b', 32, 28, 50)], 40);
    expect(out.filter((e) => e.kind === 'full')).toHaveLength(1);
    // ...mas fora do raio nos dois eixos continua completo.
    const far = planMarkerLayout([item('a', 0, 0, 90), item('b', 40, 40, 50)], 40);
    expect(far.filter((e) => e.kind === 'full')).toHaveLength(2);
  });

  it('dois completos têm sempre um eixo ≥ raio (bounding boxes de 34 px nunca se tocam)', () => {
    const items = [
      item('a', 0, 0, 90), item('b', 32, 28, 80), item('c', 39, 5, 70),
      item('d', 100, 33, 60), item('e', 100, -10, 55), item('f', -41, 20, 50),
    ];
    const out = planMarkerLayout(items, 40);
    const fulls = out.filter((e) => e.kind === 'full').map((e) => items.find((i) => i.id === e.id)!);
    for (let i = 0; i < fulls.length; i++) {
      for (let j = i + 1; j < fulls.length; j++) {
        const cheb = Math.max(
          Math.abs(fulls[i].x - fulls[j].x),
          Math.abs(fulls[i].y - fulls[j].y),
        );
        expect(cheb).toBeGreaterThanOrEqual(40);
      }
    }
  });

  it('spread (agrupar desligado) torna tudo completo mesmo colidindo', () => {
    const out = planMarkerLayout(
      [item('a', 0, 0, 90), item('b', 5, 5, 50)],
      40,
      true,
    );
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.kind === 'full' && e.memberIds.length === 1)).toBe(true);
  });

  it('empates de score: estável — decide a ordem de entrada', () => {
    const out = planMarkerLayout([item('a', 0, 0, 60), item('b', 10, 0, 60)], 40);
    expect(out.find((e) => e.kind === 'full')?.id).toBe('a');
    const out2 = planMarkerLayout([item('b', 10, 0, 60), item('a', 0, 0, 60)], 40);
    expect(out2.find((e) => e.kind === 'full')?.id).toBe('b');
  });

  it('grupos separados não se fundem', () => {
    const out = planMarkerLayout(
      [
        item('a1', 0, 0, 90), item('a2', 10, 0, 50),
        item('b1', 500, 500, 80), item('b2', 510, 500, 40),
      ],
      40,
    );
    const a1 = out.find((e) => e.id === 'a1');
    const b1 = out.find((e) => e.id === 'b1');
    expect(a1?.memberIds.sort()).toEqual(['a1', 'a2']);
    expect(b1?.memberIds.sort()).toEqual(['b1', 'b2']);
  });
});

describe('v3LodKey', () => {
  it('muda quando o papel ou a contagem muda', () => {
    expect(v3LodKey({ id: 'a', kind: 'dot', memberIds: [] })).toBe('dot');
    expect(v3LodKey({ id: 'a', kind: 'full', memberIds: ['a'] })).toBe('full:1');
    expect(v3LodKey({ id: 'a', kind: 'full', memberIds: ['a', 'b', 'c'] })).toBe('full:3');
  });
});

/* ── Ícones (divIcon capturado sem DOM) ── */

interface DivIconOpts {
  className: string;
  html: string;
  iconSize: [number, number];
  iconAnchor: [number, number];
}
const fakeL = {
  divIcon: (opts: DivIconOpts) => opts,
} as unknown as typeof import('leaflet');

describe('buildV3MarkerIcon — marcador da maquete', () => {
  it('disco 34 px, score mono, anel bg-base e contrato .spot-marker', () => {
    const icon = buildV3MarkerIcon(fakeL, { spotId: 'nazare', score: 82 }) as unknown as DivIconOpts;
    expect(icon.className).toContain('spot-marker');
    expect(icon.iconSize).toEqual([34, 34]);
    expect(icon.iconAnchor).toEqual([17, 17]);
    expect(icon.html).toContain('data-v3spot="nazare"');
    expect(icon.html).toContain('data-spot-score="82"');
    expect(icon.html).toContain('>82</span>');
    expect(icon.html).toContain('rgb(var(--bg-base))');
  });

  it('badge «+N» com os membros do grupo e aria-label localizado', () => {
    const icon = buildV3MarkerIcon(fakeL, {
      spotId: 'a',
      score: 70,
      memberIds: ['a', 'b', 'c'],
      moreAriaLabel: 'Mais 2 spots perto — ampliar',
    }) as unknown as DivIconOpts;
    expect(icon.html).toContain('class="v3more"');
    expect(icon.html).toContain('data-v3members="a,b,c"');
    expect(icon.html).toContain('+2');
    expect(icon.html).toContain('aria-label="Mais 2 spots perto — ampliar"');
  });

  it('sem grupo não há badge; o tique de vento roda para onde sopra', () => {
    const solo = buildV3MarkerIcon(fakeL, { spotId: 'a', score: 70 }) as unknown as DivIconOpts;
    expect(solo.html).not.toContain('v3more');
    expect(solo.html).not.toContain('v3tick');
    const windy = buildV3MarkerIcon(fakeL, {
      spotId: 'a',
      score: 70,
      windBlowsToDeg: 250,
    }) as unknown as DivIconOpts;
    expect(windy.html).toContain('v3tick');
    expect(windy.html).toContain('rotate(250deg)');
  });

  it('escapa ids/nomes no HTML (XSS)', () => {
    const icon = buildV3MarkerIcon(fakeL, {
      spotId: 'a"><img',
      score: 50,
      memberIds: ['a"><img', 'b'],
    }) as unknown as DivIconOpts;
    expect(icon.html).not.toContain('"><img');
  });
});

describe('buildV3DotIcon — ponto de colisão', () => {
  it('hit-area alargada (24 px) com o ponto de 10 px', () => {
    const icon = buildV3DotIcon(fakeL, 'x', 55) as unknown as DivIconOpts;
    expect(icon.className).toContain('spot-marker');
    expect(icon.iconSize).toEqual([24, 24]);
    expect(icon.html).toContain('data-v3kind="dot"');
    expect(icon.html).toContain('data-spot-score="55"');
    expect(icon.html).toContain('width:10px;height:10px');
  });
});

/* ── Contraste WCAG AA do score no marcador ── */

describe('contraste do score (WCAG AA ≥ 4.5:1)', () => {
  it('relativeLuminance / contrastRatio: casos conhecidos', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 2);
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 3);
  });

  it.each([
    ['epic', 90], ['good', 70], ['fair', 50], ['poor', 30], ['closed', 10],
  ] as const)('escalão %s passa AA nos dois temas', (tier, score) => {
    for (const theme of ['dark', 'light'] as const) {
      const bg = theme === 'dark' ? SCORE_TIER_HEX_DARK[tier] : SCORE_TIER_HEX_LIGHT[tier];
      const ink = markerScoreInkHex(score, theme);
      expect(contrastRatio(ink, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('o escalão «closed» usa branco fixo (bg-base falhava AA no cinza)', () => {
    expect(markerScoreInkCss(10)).toBe(MARKER_INK_CLOSED);
    expect(markerScoreInkCss(50)).toBe('rgb(var(--bg-base))');
    // Sanidade: branco no #6B7280 = 4.79:1
    expect(contrastRatio(MARKER_INK_CLOSED, SCORE_TIER_HEX_DARK.closed)).toBeGreaterThanOrEqual(4.5);
  });
});
