import { describe, it, expect } from 'vitest';
import { PATH_ALIASES, resolvePathAlias, aliasTargetPath } from '@/lib/pathAliases';

describe('pathAliases', () => {
  it('maps the PT mental-model aliases to canonical EN/product paths', () => {
    expect(resolvePathAlias('favoritos')).toBe('favorites');
    expect(resolvePathAlias('comparar')).toBe('compare');
    expect(resolvePathAlias('sobre')).toBe('about');
    expect(resolvePathAlias('seasonality')).toBe('sazonalidade');
  });

  it('returns null for unknown segments', () => {
    expect(resolvePathAlias('favorites')).toBeNull();
    expect(resolvePathAlias('')).toBeNull();
  });

  it('builds trailingSlash-compatible targets', () => {
    expect(aliasTargetPath('pt', 'favorites')).toBe('/pt/favorites/');
    expect(aliasTargetPath('en', 'sazonalidade')).toBe('/en/sazonalidade/');
  });

  it('lists every alias once', () => {
    const aliases = PATH_ALIASES.map((a) => a.alias);
    expect(new Set(aliases).size).toBe(aliases.length);
    expect(aliases).toEqual(['favoritos', 'comparar', 'sobre', 'seasonality']);
  });
});
