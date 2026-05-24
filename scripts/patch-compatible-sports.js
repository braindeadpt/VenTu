/**
 * One-off patcher: add compatibleSports to spots missing the field.
 * Usage: node scripts/patch-compatible-sports.js
 */

const fs = require('fs');
const path = require('path');

const TYPE_TO_SPORTS = {
  surf: ['surf', 'bodyboard'],
  'big-wave': ['surf'],
  bodyboard: ['surf', 'bodyboard'],
  kitesurf: ['kitesurf'],
  windsurf: ['windsurf'],
  foil: ['surf', 'kitesurf', 'windsurf'],
  wakeboard: ['wakeboard'],
  sup: ['sup'],
  multisport: ['surf', 'kitesurf', 'windsurf', 'bodyboard', 'sup'],
};

const spotsPath = path.join(__dirname, '../src/lib/spots.ts');
let content = fs.readFileSync(spotsPath, 'utf8');
const EOL = content.includes('\r\n') ? '\r\n' : '\n';

const blockRe = /(\{[\s\S]*?slug: '[^']+'[\s\S]*?\r?\n    \},)/g;
let patched = 0;

content = content.replace(blockRe, (block) => {
  if (block.includes('compatibleSports:')) return block;

  const typeMatch = block.match(/type: '([^']+)'/);
  if (!typeMatch) return block;

  const sports = TYPE_TO_SPORTS[typeMatch[1]] ?? ['surf'];
  const line = `      compatibleSports: [${sports.map((s) => `'${s}'`).join(', ')}],${EOL}`;

  const insertAfter = (source, field) => {
    const re = new RegExp(`(${field}: (?:'[^']*'|"[^"]*"),\\r?\\n)`);
    if (!re.test(source)) return null;
    return source.replace(re, `$1${line}`);
  };

  const updated =
    insertAfter(block, 'descriptionEn') ??
    insertAfter(block, 'description');

  if (updated) {
    patched++;
    return updated;
  }

  return block;
});

if (patched === 0) {
  console.log('No spots to patch.');
  process.exit(0);
}

fs.writeFileSync(spotsPath, content);
console.log(`✅ Patched ${patched} spots with compatibleSports`);
