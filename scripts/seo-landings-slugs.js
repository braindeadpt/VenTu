/**
 * SEO landing slugs for sitemap generation (mirrors src/lib/seoLandings.ts).
 */

const fs = require('fs');
const path = require('path');

const SEO_SPORTS = [
  'surf', 'kitesurf', 'windsurf', 'bodyboard', 'sup', 'foil', 'wakeboard', 'big-wave',
];

const REGION_SLUGS = {
  Norte: 'norte',
  Centro: 'centro',
  Lisboa: 'lisboa',
  Alentejo: 'alentejo',
  Algarve: 'algarve',
  'Açores': 'acores',
  Madeira: 'madeira',
};

const MUNICIPALITY_TO_REGION = {
  Porto: 'Norte', 'Viana do Castelo': 'Norte', Braga: 'Norte', Esposende: 'Norte',
  'Vila do Conde': 'Norte', Caminha: 'Norte', Ovar: 'Norte', Aveiro: 'Norte', Espinho: 'Norte',
  Nazaré: 'Centro', Oeste: 'Centro', Santarém: 'Centro', 'Figueira da Foz': 'Centro',
  Óbidos: 'Centro', Cantanhede: 'Centro', Lourinhã: 'Centro', 'Caldas da Rainha': 'Centro',
  Cascais: 'Lisboa', Ericeira: 'Lisboa', Peniche: 'Lisboa', Almada: 'Lisboa',
  Sesimbra: 'Lisboa', Sintra: 'Lisboa', 'Torres Vedras': 'Lisboa', 'Costa da Caparica': 'Lisboa', Seixal: 'Lisboa',
  Alentejo: 'Alentejo', 'Zambujeira do Mar': 'Alentejo',
  Algarve: 'Algarve', Sagres: 'Algarve', Portimão: 'Algarve', Lagos: 'Algarve',
  Aljezur: 'Algarve', Faro: 'Algarve', Lagoa: 'Algarve', Olhão: 'Algarve', Tavira: 'Algarve',
  'Vila do Bispo': 'Algarve', Carrapateira: 'Algarve', Albufeira: 'Algarve', Alvor: 'Algarve',
  'Vila Real de Santo António': 'Algarve',
  'São Miguel': 'Açores', Terceira: 'Açores', 'Santa Maria': 'Açores', Faial: 'Açores',
  Açores: 'Açores', Pico: 'Açores', 'São Jorge': 'Açores',
  Madeira: 'Madeira',
};

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

function parseSpots(content) {
  const spots = [];
  const re = /id: '([^']+)'[\s\S]*?(?=^\s+id: '|^\];)/gm;
  let m;
  while ((m = re.exec(content))) {
    const block = m[0];
    const id = m[1];
    const type = (block.match(/type: '([^']+)'/) || [])[1];
    const region = (block.match(/region: '([^']+)'/) || [])[1];
    let compatibleSports = null;
    const csMatch = block.match(/compatibleSports: \[([^\]]*)\]/);
    if (csMatch) {
      compatibleSports = [...csMatch[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    }
    spots.push({ id, type, region, compatibleSports });
  }
  return spots;
}

function getCompatibleSports(spot) {
  if (spot.compatibleSports?.length) return spot.compatibleSports;
  return TYPE_TO_SPORTS[spot.type] || ['surf'];
}

function getMacroRegion(municipality) {
  return MUNICIPALITY_TO_REGION[municipality] || '';
}

function countSpots(spots, sport, region) {
  return spots.filter((spot) => {
    if (region) {
      if (getMacroRegion(spot.region) !== region) return false;
    }
    if (sport === 'big-wave') return spot.type === 'big-wave';
    return getCompatibleSports(spot).includes(sport);
  }).length;
}

function getSeoLandingSlugs() {
  const content = fs.readFileSync(path.join(__dirname, '../src/lib/spots.ts'), 'utf8');
  const spots = parseSpots(content);
  const slugs = [];

  for (const sport of SEO_SPORTS) {
    if (countSpots(spots, sport)) slugs.push(sport);
    for (const region of Object.keys(REGION_SLUGS)) {
      if (countSpots(spots, sport, region) > 0) {
        slugs.push(`${sport}-${REGION_SLUGS[region]}`);
      }
    }
  }

  return slugs;
}

module.exports = { getSeoLandingSlugs };
