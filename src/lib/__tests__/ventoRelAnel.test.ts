import { describe, expect, it } from 'vitest';
import { ventoRel } from '@/lib/modalidades/avalia';
import { relacaoAnelDeK, relacaoAnelVento, ventoRelKAnel } from '@/lib/ventoRelAnel';
import { spots } from '@/lib/spots';
import editorial from '@/lib/spotEditorial.json';

/** #218, PR 6 — anel do vento do /mapa pela classificação `ventoRel` do motor v6. */
describe('ventoRelAnel', () => {
  it('bate com o `ventoRel` do motor em todos os ângulos (praias a 0°, 150°, 195°, 270°, 300°)', () => {
    for (const praiaVirada of [0, 150, 195, 270, 300]) {
      for (let wd = 0; wd < 360; wd += 0.5) {
        expect(ventoRelKAnel(wd, praiaVirada)).toBe(ventoRel({ praiaVirada }, wd).k);
      }
    }
  });

  it('mar + lat-mar = onshore; lat = cross; lat-terra + terra = offshore', () => {
    expect(relacaoAnelDeK('mar')).toBe('onshore');
    expect(relacaoAnelDeK('lat-mar')).toBe('onshore');
    expect(relacaoAnelDeK('lat')).toBe('cross');
    expect(relacaoAnelDeK('lat-terra')).toBe('offshore');
    expect(relacaoAnelDeK('terra')).toBe('offshore');
  });

  it('limites: 65° onshore / 66° cross; 110° cross / 111° offshore (antes 67,5° e 112,5°)', () => {
    expect(relacaoAnelVento(270 + 65, 270)).toBe('onshore');
    expect(relacaoAnelVento(270 + 66, 270)).toBe('cross');
    expect(relacaoAnelVento(270 - 110, 270)).toBe('cross');
    expect(relacaoAnelVento(270 - 111, 270)).toBe('offshore');
    expect(relacaoAnelVento(90, 270)).toBe('offshore');
    expect(relacaoAnelVento(270, 270)).toBe('onshore');
    expect(relacaoAnelVento(0, 270)).toBe('cross');
  });

  it('sem orientação (água interior) → sem relação', () => {
    expect(relacaoAnelVento(90, undefined)).toBeNull();
    expect(relacaoAnelVento(Number.NaN, 270)).toBeNull();
  });

  it('a praia do anel (coastOrientation) é a praiaVirada dos curados', () => {
    const cur = (editorial as unknown as { spots: Record<string, { praiaVirada: number }> }).spots;
    for (const [id, e] of Object.entries(cur)) {
      const sp = spots.find((s) => s.id === id);
      expect(sp, id).toBeDefined();
      expect(sp!.coastOrientation, id).toBe(e.praiaVirada);
    }
  });
});
