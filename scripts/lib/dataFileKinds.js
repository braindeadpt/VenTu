/**
 * Which public/data paths are binary payloads (radar PNGs, fonts, …).
 * validate-data-files must skip these — they are not UTF-8 text and used to
 * fail the update-data gate as "invalid UTF-8".
 */

const path = require('path');

const BINARY_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bin',
  '.gz',
  '.zip',
  '.wasm',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
]);

/** @param {string} rel path relative to public/data */
function isBinaryDataRel(rel) {
  return BINARY_EXT.has(path.extname(String(rel || '')).toLowerCase());
}

module.exports = { BINARY_EXT, isBinaryDataRel };
