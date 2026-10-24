/**
 * Contrato (24/10): o diretório de escolas (public/data/directory.json) ficou a
 * apontar para spots removidos no #296 (povoa-varzim, sines) — o «Perto» das
 * páginas de spot e o sitemap liam ids que já não existem. Cada spotId do
 * diretório e cada hint do fetch-osm tem de ser um spot vivo.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const spots = JSON.parse(readFileSync(join(root, 'public/data/spots-index.json'), 'utf8')).spots as Array<{
  id: string;
  slug: string;
}>;
const vivos = new Set(spots.flatMap((s) => [s.id, s.slug]));

describe('diretório de escolas: referências a spots', () => {
  it('cada spotId do directory.json existe no spots-index', () => {
    const dir = JSON.parse(readFileSync(join(root, 'public/data/directory.json'), 'utf8')) as {
      entries: Array<{ slug: string; spotIds: string[] }>;
    };
    const orfaos = dir.entries.flatMap((e) => e.spotIds.filter((id) => !vivos.has(id)).map((id) => `${e.slug} → ${id}`));
    expect(orfaos).toEqual([]);
  });

  it('cada hint de morada do fetch-osm aponta para um spot vivo', () => {
    const src = readFileSync(join(root, 'scripts/directory/fetch-osm.ts'), 'utf8');
    const hints = [...src.matchAll(/hint: '([^']+)'/g)].map((m) => m[1]);
    expect(hints.length).toBeGreaterThan(10);
    expect(hints.filter((h) => !vivos.has(h))).toEqual([]);
  });
});
