import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spots } from '../src/lib/spots';
import type { BestWindowToday } from '../src/lib/bestWindowToday';

interface IndexSpot {
  slug: string;
  bestWindowToday?: BestWindowToday | null;
}

const indexPath = join(process.cwd(), 'public', 'data', 'spots-index.json');
let indexBySlug = new Map<string, BestWindowToday | null>();

if (existsSync(indexPath)) {
  const index = JSON.parse(readFileSync(indexPath, 'utf-8')) as { spots?: IndexSpot[] };
  indexBySlug = new Map(
    (index.spots ?? []).map((s) => [s.slug, s.bestWindowToday ?? null]),
  );
}

const lite = spots.map((s) => ({
  slug: s.slug,
  name: s.name,
  nameEn: s.nameEn,
  region: s.region,
  regionEn: s.regionEn,
  bestWindowToday: indexBySlug.get(s.slug) ?? null,
}));

const outPath = join(process.cwd(), 'public', 'data', 'spots-lite.json');
writeFileSync(outPath, JSON.stringify(lite));
console.log(`[spots-lite] Generated ${lite.length} entries → ${outPath}`);
