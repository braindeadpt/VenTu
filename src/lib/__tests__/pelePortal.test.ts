// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { pelePortalDe } from '@/lib/pelePortal';
import { buildV3MarkerHtml } from '@/components/spots/mapMarkers';
import { WIND_RING_LEGEND_SAMPLE, windBlowsToDegrees } from '@/lib/mapWindArrow';
import { relacaoAnelVento } from '@/lib/ventoRelAnel';

describe('pelePortalDe (#458 §3: portais herdam a pele da âncora)', () => {
  it('devolve v6 quando a âncora vive dentro de [data-pele=v6]', () => {
    document.body.innerHTML = '<div data-pele="v6"><section><button id="a"></button></section></div>';
    expect(pelePortalDe(document.getElementById('a'))).toBe('v6');
  });

  it('nada fora da pele, com outra pele ou sem âncora', () => {
    document.body.innerHTML = '<div><button id="a"></button></div><div data-pele="v5"><button id="b"></button></div>';
    expect(pelePortalDe(document.getElementById('a'))).toBeUndefined();
    expect(pelePortalDe(document.getElementById('b'))).toBeUndefined();
    expect(pelePortalDe(null)).toBeUndefined();
  });
});

describe('amostra v6 da legenda do vento', () => {
  it('é o marcador .v3mk do mapa, com o tique offshore', () => {
    const { score, fromDeg, coastOrientation } = WIND_RING_LEGEND_SAMPLE;
    const rel = relacaoAnelVento(fromDeg, coastOrientation);
    expect(rel).toBe('offshore');
    const html = buildV3MarkerHtml({
      spotId: 'legenda-vento',
      score,
      windBlowsToDeg: windBlowsToDegrees(fromDeg),
      windRel: rel,
    });
    expect(html).toContain('class="v3mk"');
    expect(html).toContain('data-vento-rel="offshore"');
    expect(html).toContain(`rotate(${windBlowsToDegrees(fromDeg)}deg)`);
  });
});
