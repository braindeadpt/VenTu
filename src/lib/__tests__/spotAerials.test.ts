/**
 * Guarda: cada spot sem imagem curada tem a foto aérea local
 * (`public/images/spots/{slug}.jpg`, gerada por scripts/generate-spot-aerials.mjs).
 * Sem ela a home pede um ficheiro que não existe e o smoke do deploy
 * (critical-routes, «same-origin 404») falha — aconteceu a 24/10 com `calada`.
 * Ao adicionar ou mover um spot: `node scripts/generate-spot-aerials.mjs --only <slug> --force`.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { spots } from '@/lib/spots';

describe('fotos aéreas dos spots', () => {
  it('todos os spots sem imagem curada têm public/images/spots/{slug}.jpg', () => {
    const dir = join(process.cwd(), 'public', 'images', 'spots');
    const missing = spots
      .filter((s) => !s.images?.[0]?.trim())
      .map((s) => s.slug)
      .filter((slug) => !existsSync(join(dir, `${slug}.jpg`)));
    expect(missing, `correr: node scripts/generate-spot-aerials.mjs --only ${missing.join(',')}`).toEqual([]);
  });
});
