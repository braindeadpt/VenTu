import { describe, expect, it } from 'vitest';
import { distanceKm, entriesNearSpot } from '../directory';
import { applyDirectoryProfiles, mergeDirectoryEntries } from '../directoryListings';
import type { DirectoryEntry } from '@/types/directory';

const base = (over: Partial<DirectoryEntry>): DirectoryEntry => ({
  id: 't1',
  slug: 't1',
  name: 'Test School',
  kind: 'surf_school',
  sports: ['surf'],
  lat: 38.7,
  lon: -9.4,
  spotIds: [],
  source: 'curated',
  ...over,
});

describe('directory geo', () => {
  it('distanceKm is ~0 for same point', () => {
    expect(distanceKm(38.7, -9.4, 38.7, -9.4)).toBeLessThan(0.01);
  });

  it('entriesNearSpot ranks by distance and respects maxKm', () => {
    const entries = [
      base({ id: 'near', slug: 'near', lat: 38.701, lon: -9.401, spotIds: ['guincho'] }),
      base({ id: 'far', slug: 'far', lat: 41.1, lon: -8.6, spotIds: [] }),
    ];
    const near = entriesNearSpot(entries, 'guincho', 38.7, -9.4, { maxKm: 15, limit: 5 });
    expect(near.map((e) => e.id)).toEqual(['near']);
    expect(near[0].distanceKm).toBeLessThan(2);
  });
});

describe('mergeDirectoryEntries', () => {
  it('unverified submitted nunca desloca entrada curada — por slug (squatting)', () => {
    const seed = [base({ id: 'aesp-escola-x', slug: 'escola-x', name: 'Onda Azul' })];
    const live = [
      base({
        id: 'sub-abc12345',
        slug: 'escola-x',
        name: 'Escola Falsa',
        source: 'submitted',
        verified: false,
        website: 'https://phishing.example',
      }),
    ];
    const merged = mergeDirectoryEntries(seed, live);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Onda Azul');
    expect(merged[0].website).toBeUndefined();
  });

  it('unverified submitted nunca desloca entrada curada — por id (squatting)', () => {
    const seed = [base({ id: 'aesp-escola-x', slug: 'escola-x', name: 'Onda Azul' })];
    const live = [
      base({
        id: 'aesp-escola-x',
        slug: 'outra-coisa-abc12345',
        name: 'Escola Falsa',
        source: 'submitted',
        verified: false,
      }),
    ];
    const merged = mergeDirectoryEntries(seed, live);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Onda Azul');
  });

  it('listagem verificada/claimed substitui a seed (fluxo de claim legítimo)', () => {
    const seed = [base({ id: 'aesp-escola-x', slug: 'escola-x', name: 'Old' })];
    const live = [
      base({
        id: 'aesp-escola-x',
        slug: 'escola-x',
        name: 'New Claimed',
        source: 'claimed',
        verified: true,
      }),
    ];
    const merged = mergeDirectoryEntries(seed, live);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('New Claimed');
  });

  it('submissão legítima com slug próprio aparece ao lado da curada', () => {
    const seed = [base({ id: 'aesp-escola-x', slug: 'escola-x', name: 'Onda Azul' })];
    const live = [
      base({
        id: 'sub-def67890',
        slug: 'escola-nova-def67890',
        name: 'Escola Nova',
        source: 'submitted',
        verified: false,
      }),
    ];
    const merged = mergeDirectoryEntries(seed, live);
    expect(merged).toHaveLength(2);
    expect(merged.map((e) => e.slug).sort()).toEqual(['escola-nova-def67890', 'escola-x']);
  });

  it('sorts pro/featured before free', () => {
    const merged = mergeDirectoryEntries(
      [
        base({ id: 'a', slug: 'a', name: 'Zebra Free', tier: 'free' }),
        base({ id: 'b', slug: 'b', name: 'Alpha Pro', tier: 'pro' }),
        base({ id: 'c', slug: 'c', name: 'Mid Featured', tier: 'featured' }),
      ],
      [],
    );
    expect(merged.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('applyDirectoryProfiles', () => {
  it('overlays owner contact fields and verified on seed', () => {
    const seed = [base({ id: 'aesp-1', slug: 'escola', website: 'https://old.example' })];
    const profiles = new Map([
      [
        'aesp-1',
        {
          tier: 'featured' as const,
          verified: true,
          displayName: 'Escola Nova',
          website: 'https://new.example',
          phone: '910000000',
        },
      ],
    ]);
    const [out] = applyDirectoryProfiles(seed, profiles);
    expect(out.name).toBe('Escola Nova');
    expect(out.website).toBe('https://new.example');
    expect(out.phone).toBe('910000000');
    expect(out.verified).toBe(true);
    expect(out.tier).toBe('featured');
    expect(out.source).toBe('claimed');
  });
});
