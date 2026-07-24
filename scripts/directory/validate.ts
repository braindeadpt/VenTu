/**
 * Validate public/data/directory.json
 * Usage: npm run directory:validate
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { DirectoryFile } from '../../src/types/directory';

const PATH = join(process.cwd(), 'public', 'data', 'directory.json');

function main() {
  if (!existsSync(PATH)) {
    console.error('Missing', PATH, '— run npm run directory:fetch');
    process.exit(1);
  }
  const file = JSON.parse(readFileSync(PATH, 'utf-8')) as DirectoryFile;
  const ids = new Set<string>();
  const slugs = new Set<string>();
  let errors = 0;

  for (const e of file.entries || []) {
    if (!e.id || !e.slug || !e.name) {
      console.error('Invalid entry (missing id/slug/name)', e);
      errors++;
      continue;
    }
    if (ids.has(e.id)) {
      console.error('Duplicate id', e.id);
      errors++;
    }
    ids.add(e.id);
    if (slugs.has(e.slug)) {
      console.error('Duplicate slug', e.slug);
      errors++;
    }
    slugs.add(e.slug);
    if (e.lat < 32 || e.lat > 43 || e.lon < -32 || e.lon > -5) {
      console.error('Coords outside PT box', e.id, e.lat, e.lon);
      errors++;
    }
  }

  console.log(`Entries: ${file.entries?.length ?? 0} · source: ${file.source}`);
  if (errors) {
    console.error(`❌ ${errors} error(s)`);
    process.exit(1);
  }
  console.log('✅ directory OK');
}

main();
