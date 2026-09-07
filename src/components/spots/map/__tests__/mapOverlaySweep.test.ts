import { describe, expect, it } from 'vitest';
import { sweepOverlaysBeforeMapRemove } from '@/components/spots/map/mapOverlaySweep';

type Tagged = { id: string };
type Op = { kind: 'removeLayer' | 'remove'; id?: string };

// Fake Leaflet map that records the exact order of every operation. eachLayer
// snapshots the layers (as Leaflet's own teardown iterates the collected
// copy, not the live registry being mutated).
function makeMap(layers: Tagged[], failRemoveLayerOf?: Tagged) {
  const ops: Op[] = [];
  const map = {
    eachLayer(fn: (layer: unknown) => void): void {
      [...layers].forEach((layer) => fn(layer));
    },
    removeLayer(layer: unknown) {
      const id = (layer as Tagged).id;
      ops.push({ kind: 'removeLayer', id });
      if (failRemoveLayerOf === layer) throw new Error(`removeLayer failed for ${id}`);
      return map;
    },
    remove() {
      ops.push({ kind: 'remove' });
      return map;
    },
  };
  return { map, ops };
}

const renderer: Tagged = { id: 'canvas-renderer' };
const isobaths: Tagged = { id: 'isobaths' };
const coastal: Tagged = { id: 'coastal-warnings' };
const cluster: Tagged = { id: 'marker-cluster' };
const isRenderer = (layer: unknown) => layer === renderer;

describe('sweepOverlaysBeforeMapRemove (teardown order from commit 8326a7bd0)', () => {
  it('removes every non-renderer overlay BEFORE map.remove(), renderer last-left', () => {
    const { map, ops } = makeMap([renderer, isobaths, coastal, cluster]);
    sweepOverlaysBeforeMapRemove(map, isRenderer);

    // The renderer is never handed to removeLayer — Map.remove() destroys it.
    expect(ops.filter((o) => o.kind === 'removeLayer').map((o) => o.id)).toEqual([
      'isobaths',
      'coastal-warnings',
      'marker-cluster',
    ]);
    // Strict ordering contract: the sweep finishes, then remove() runs last.
    const kinds = ops.map((o) => o.kind);
    expect(kinds[kinds.length - 1]).toBe('remove');
    expect(kinds.filter((k) => k === 'removeLayer').length).toBe(3);
  });

  it('never calls removeLayer on a renderer — it is left for Map.remove() to destroy', () => {
    const { map, ops } = makeMap([renderer]);
    sweepOverlaysBeforeMapRemove(map, isRenderer);

    expect(ops).toEqual([{ kind: 'remove' }]);
  });

  it('an empty map still reaches remove()', () => {
    const { map, ops } = makeMap([]);
    sweepOverlaysBeforeMapRemove(map, isRenderer);
    expect(ops).toEqual([{ kind: 'remove' }]);
  });

  it('a removeLayer that throws does not stop the sweep — the remaining overlays and remove() still run', () => {
    const { map, ops } = makeMap([isobaths, renderer, coastal]);
    sweepOverlaysBeforeMapRemove(map, isRenderer);

    expect(ops.map((o) => (o.kind === 'removeLayer' ? o.id : 'remove'))).toEqual([
      'isobaths',
      'coastal-warnings',
      'remove',
    ]);
  });

  it('a map whose remove() itself throws still had every overlay swept and never throws', () => {
    const { map, ops } = makeMap([isobaths, renderer, coastal]);
    // Sabotage remove() after the sweep has run.
    map.remove = () => {
      ops.push({ kind: 'remove' });
      throw new Error('remove failed');
    };
    expect(() => sweepOverlaysBeforeMapRemove(map, isRenderer)).not.toThrow();

    const ids = ops.filter((o) => o.kind === 'removeLayer').map((o) => o.id);
    expect(ids).toEqual(['isobaths', 'coastal-warnings']);
    expect(ops[ops.length - 1]).toEqual({ kind: 'remove' });
  });

  it('the isRenderer predicate receives every layer (renderers identified by instanceof-style check)', () => {
    const { map, ops } = makeMap([renderer, isobaths]);
    const seen: string[] = [];
    sweepOverlaysBeforeMapRemove(map, (layer) => {
      seen.push((layer as Tagged).id);
      return layer === renderer;
    });

    expect(seen).toEqual(['canvas-renderer', 'isobaths']);
    expect(ops).toEqual([{ kind: 'removeLayer', id: 'isobaths' }, { kind: 'remove' }]);
  });
});
