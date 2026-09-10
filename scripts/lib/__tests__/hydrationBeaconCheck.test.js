import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  SETTER_RE,
  findHydrationSetter,
  findHydrationSetterInChunk,
} from '../hydrationBeaconCheck';

const MINIFIED = `(0,module.exports.useEffect)(()=>{document.documentElement.classList.add("is-hydrated")},[]),null`;

describe('hydrationBeaconCheck (built-bundle setter)', () => {
  it('corresponde à forma minificada real (document.documentElement.classList.add("is-hydrated"))', () => {
    expect(SETTER_RE.test(MINIFIED)).toBe(true);
  });

  it('corresponde a aspas simples e espaços entre tokens (minificadores variam)', () => {
    expect(SETTER_RE.test(`e.classList.add('is-hydrated')`)).toBe(true);
    expect(SETTER_RE.test(`document.documentElement.classList . add ( "is-hydrated" )`)).toBe(true);
  });

  it('NÃO corresponde quando a classe é adicionada com outro nome (setter trocado)', () => {
    expect(SETTER_RE.test(`e.classList.add("is-hydrated-x")`)).toBe(false);
    expect(SETTER_RE.test(`e.classList.add("hydrated")`)).toBe(false);
  });

  it('NÃO corresponde quando a string existe só no CSS (selectores .is-hydrated) ou como classe removida', () => {
    // Um chunk com o texto do CSS inline não conta: o setter é classList.add,
    // não um seletor `.is-hydrated{...}`.
    expect(SETTER_RE.test(`.is-hydrated{opacity:0}[data-map-ready='true'] [data-map-hero-poster]`)).toBe(false);
    expect(SETTER_RE.test(`e.classList.remove("is-hydrated")`)).toBe(false);
  });

  it('encontra o setter num diretório de chunks construído', () => {
    const dir = mkdtempSync(join(tmpdir(), 'beacon-check-'));
    try {
      const chunks = join(dir, '_next', 'static', 'chunks');
      mkdirSync(chunks, { recursive: true });
      writeFileSync(join(chunks, 'a.js'), 'console.log(1)');
      writeFileSync(join(chunks, 'b.js'), MINIFIED);
      const res = findHydrationSetter(dir);
      expect(res.found).toBe(true);
      expect(res.chunk).toContain('b.js');
      expect(res.jsChunks.length).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falha quando nenhum chunk tem o setter (beacon stripped)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'beacon-miss-'));
    try {
      const chunks = join(dir, '_next', 'static', 'chunks');
      mkdirSync(chunks, { recursive: true });
      // Só o CSS: a string existe, o setter não.
      writeFileSync(join(chunks, 'a.js'), `.is-hydrated{display:none}`);
      writeFileSync(join(chunks, 'b.js'), `e.classList.add("other-class")`);
      const res = findHydrationSetter(dir);
      expect(res.found).toBe(false);
      expect(res.chunk).toBeNull();
      expect(res.jsChunks.length).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falha com lista vazia quando o diretório de chunks nem existe (build não correu)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'beacon-none-'));
    try {
      const res = findHydrationSetter(dir);
      expect(res.found).toBe(false);
      expect(res.jsChunks).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});