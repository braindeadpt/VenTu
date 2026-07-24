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
  it('prefers live submitted over seed same slug', () => {
    const seed = [base({ id: 'seed-1', slug: 'escola-x', name: 'Old' })];
    const live = [
      base({
        id: 'sub-1',
        slug: 'escola-x',
        name: 'New Submitted',
        source: 'submitted',
        verified: false,
      }),
    ];
    const merged = mergeDirectoryEntries(seed, live);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('New Submitted');
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
