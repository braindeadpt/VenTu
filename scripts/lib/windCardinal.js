/** Meteorological degrees → cardinal (EN); mirrors src/lib/wind.ts */
function getCardinalLabel(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(((deg % 360) / 45)) % 8;
  return dirs[idx];
}

module.exports = { getCardinalLabel };
