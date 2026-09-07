import { beforeEach, describe, expect, it, vi } from 'vitest';
import type L from 'leaflet';
import type { guardLeafletCanvas as GuardLeafletCanvas } from '@/components/spots/map/leafletCanvasGuard';

// The guard under test is applied once per Leaflet instance via a module-level
// flag (matching production, where useMapCore calls it when Leaflet loads).
// Reset the module registry before every case so each test gets a pristine,
// unguarded prototype — otherwise only the first test in this file could
// exercise the wrap.
async function loadGuard(): Promise<typeof GuardLeafletCanvas> {
  vi.resetModules();
  const mod = await import('@/components/spots/map/leafletCanvasGuard');
  return mod.guardLeafletCanvas;
}

type FakeCtx = { save: () => void; clearRect: () => void };
type FakeRenderer = { _ctx?: FakeCtx | null };

// Mirrors Leaflet 1.9.4's unguarded canvas paths: _redraw dereferences
// _ctx.save(), _update dereferences _ctx.clearRect(). On a destroyed renderer
// (_ctx deleted by _destroyContainer) the originals throw exactly the CI
// error: "Cannot read properties of undefined (reading 'save'/'clearRect')".
function makeHarness() {
  const calls = { redraw: 0, update: 0, save: 0, clearRect: 0 };
  const ctx = (): FakeCtx => ({
    save: () => {
      calls.save += 1;
    },
    clearRect: () => {
      calls.clearRect += 1;
    },
  });
  const prototype = {
    _redraw: function (this: FakeRenderer) {
      calls.redraw += 1;
      if (!this._ctx) throw new TypeError("Cannot read properties of undefined (reading 'save')");
      this._ctx.save();
    },
    _update: function (this: FakeRenderer) {
      calls.update += 1;
      if (!this._ctx) throw new TypeError("Cannot read properties of undefined (reading 'clearRect')");
      this._ctx.clearRect();
    },
  };
  const fakeLeaflet = { Canvas: { prototype } } as unknown as typeof L;
  return { calls, ctx, prototype, fakeLeaflet };
}

describe('guardLeafletCanvas (Leaflet canvas teardown guard, commit 8326a7bd0)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('delegates _redraw and _update to the originals while the renderer is alive', async () => {
    const guard = await loadGuard();
    const { calls, ctx, prototype, fakeLeaflet } = makeHarness();
    guard(fakeLeaflet);

    const live: FakeRenderer = { _ctx: ctx() };
    prototype._redraw.call(live);
    prototype._update.call(live);

    expect(calls.redraw).toBe(1);
    expect(calls.update).toBe(1);
    expect(calls.save).toBe(1);
    expect(calls.clearRect).toBe(1);
  });

  it('no-ops _redraw after _destroyContainer deleted _ctx (the CI 34075896616 crash)', async () => {
    const guard = await loadGuard();
    const { calls, prototype, fakeLeaflet } = makeHarness();
    guard(fakeLeaflet);

    const destroyed: FakeRenderer = { _ctx: null };
    expect(() => prototype._redraw.call(destroyed)).not.toThrow();
    expect(() => prototype._update.call(destroyed)).not.toThrow();
    // The originals must never run against a destroyed renderer.
    expect(calls.redraw).toBe(0);
    expect(calls.update).toBe(0);
    expect(calls.save).toBe(0);
  });

  it('also tolerates _ctx being absent rather than null (late frame after unmount)', async () => {
    const guard = await loadGuard();
    const { calls, prototype, fakeLeaflet } = makeHarness();
    guard(fakeLeaflet);

    // Late frame on a renderer whose context was simply never created / freed.
    const bare = {};
    expect(() => prototype._redraw.call(bare)).not.toThrow();
    expect(() => prototype._update.call(bare)).not.toThrow();
    expect(calls.redraw).toBe(0);
    expect(calls.update).toBe(0);
  });

  it('control: without the guard the same destroyed-renderer call throws (proves the guard is what protects)', async () => {
    const { prototype } = makeHarness();
    const destroyed: FakeRenderer = { _ctx: null };
    expect(() => prototype._redraw.call(destroyed)).toThrow(TypeError);
    expect(() => prototype._update.call(destroyed)).toThrow(TypeError);
  });

  it('a live renderer still repaints after the guard fired once for a destroyed one', async () => {
    const guard = await loadGuard();
    const { calls, ctx, prototype, fakeLeaflet } = makeHarness();
    guard(fakeLeaflet);

    // Frame scheduled before destroy fires after destroy — no-op.
    const destroyed: FakeRenderer = { _ctx: null };
    prototype._redraw.call(destroyed);
    // Legitimate repaint afterwards must still reach the original.
    prototype._redraw.call({ _ctx: ctx() });

    expect(calls.redraw).toBe(1);
    expect(calls.save).toBe(1);
  });

  it('is idempotent: a second guard() call does not double-wrap the prototype', async () => {
    const guard = await loadGuard();
    const { calls, ctx, prototype, fakeLeaflet } = makeHarness();
    guard(fakeLeaflet);
    guard(fakeLeaflet);

    prototype._redraw.call({ _ctx: ctx() });
    // Wrapped once, so exactly one delegation — a double wrap would run the
    // original twice per call.
    expect(calls.redraw).toBe(1);
    expect(calls.save).toBe(1);
  });
});
