import { writeFileSync } from 'fs';
import { join } from 'path';
import { spots } from '../src/lib/spots';

const lite = spots.map((s) => ({
  slug: s.slug,
  name: s.name,
  nameEn: s.nameEn,
  region: s.region,
  regionEn: s.regionEn,
}));

const outPath = join(process.cwd(), 'public', 'data', 'spots-lite.json');
writeFileSync(outPath, JSON.stringify(lite));
console.log(`[spots-lite] Generated ${lite.length} entries → ${outPath}`);
