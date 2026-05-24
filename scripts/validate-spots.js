/**
 * Validates spot data integrity — run in CI or locally before deploy.
 * Usage: node scripts/validate-spots.js
 */

const fs = require('fs');
const path = require('path');

const spotsPath = path.join(__dirname, '../src/lib/spots.ts');
const content = fs.readFileSync(spotsPath, 'utf8');

const ids = [...content.matchAll(/^\s+id: '([^']+)'/gm)];
const errors = [];

const re = /id: '([^']+)'[\s\S]*?(?=^\s+id: '|^\];)/gm;
let m;

while ((m = re.exec(content))) {
  const block = m[0];
  const id = m[1];
  const type = (block.match(/type: '([^']+)'/) || [])[1];

  if (!block.includes('compatibleSports:')) {
    errors.push(`Spot "${id}" (${type || 'unknown'}) missing compatibleSports`);
  }
}

if (errors.length > 0) {
  console.error(`❌ validate-spots: ${errors.length} issue(s)\n`);
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}

console.log(`✅ validate-spots: ${ids.length}/167 spots OK — all have compatibleSports`);
