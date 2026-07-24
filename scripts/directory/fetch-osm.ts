/**
 * Fetch PT schools/shops from OpenStreetMap (Overpass) + merge curated.
 * Attach nearest VenTu spots. Writes public/data/directory.json
 *
 * Usage: npm run directory:fetch
 * Optional: DIRECTORY_SKIP_OSM=1 for curated/stubs only
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { spots } from '../../src/lib/spots';
import type {
  DirectoryEntry,
  DirectoryFile,
  DirectoryKind,
  DirectorySport,
  DirectorySource,
} from '../../src/types/directory';

const OUT = join(process.cwd(), 'public', 'data', 'directory.json');
const CURATED = join(__dirname, 'curated.json');
const AESP = join(__dirname, 'aesp-associados.json');

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/** Smaller regional bboxes (S,W,N,E) — full PT bbox times out / returns empty. */
const REGIONS: Array<{ name: string; bbox: string }> = [
  { name: 'Norte', bbox: '40.8,-8.95,42.2,-6.15' },
  { name: 'Centro', bbox: '39.2,-9.55,40.9,-6.15' },
  { name: 'Lisboa-Setúbal', bbox: '38.2,-9.55,39.3,-8.4' },
  { name: 'Alentejo-costa', bbox: '37.3,-9.05,38.3,-8.2' },
  { name: 'Algarve', bbox: '36.9,-9.05,37.45,-7.35' },
  { name: 'Madeira', bbox: '32.35,-17.3,33.2,-16.2' },
  { name: 'Açores-ocidental', bbox: '38.3,-31.4,39.8,-26.8' },
  { name: 'Açores-oriental', bbox: '36.8,-25.9,38.0,-24.7' },
];

function buildRegionQuery(bbox: string): string {
  return `
[out:json][timeout:60];
(
  nwr["shop"="surf"](${bbox});
  nwr["shop"="sports"]["sport"~"surf|kite|wind",i](${bbox});
  nwr["sport"="surfing"](${bbox});
  nwr["sport"="kitesurfing"](${bbox});
  nwr["sport"="windsurfing"](${bbox});
  nwr["leisure"="sports_centre"]["sport"~"surf|kite|wind",i](${bbox});
  nwr["leisure"="sports_centre"]["name"~"surf|kite|windsurf|bodyboard|foil",i](${bbox});
  nwr["club"="sport"]["sport"~"surf|kite|wind",i](${bbox});
  nwr["amenity"="school"]["name"~"surf|kite",i](${bbox});
  nwr["tourism"="yes"]["name"~"surf school|escola de surf|kite",i](${bbox});
  nwr["name"~"escola de surf|surf school|surf camp|kite school|kite center|centro de kite|kitesurf|windsurf school|escola de kite|surfshop|surf shop",i](${bbox});
);
out center tags;
`.trim();
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

function classifyKind(tags: Record<string, string>): DirectoryKind {
  const shop = (tags.shop || '').toLowerCase();
  const sport = (tags.sport || '').toLowerCase();
  const name = `${tags.name || ''} ${tags['name:en'] || ''}`.toLowerCase();
  const amenity = (tags.amenity || '').toLowerCase();
  const leisure = (tags.leisure || '').toLowerCase();
  const blob = `${name} ${sport} ${shop} ${leisure}`;

  if (/kite|kitesurf|kiteboard/.test(blob)) return 'kite_center';
  if (/windsurf|wind.?surf/.test(blob)) return 'windsurf';
  if (shop === 'surf' || /surf ?shop|surfshop|boardshop/.test(name)) return 'shop';
  if (/rent|aluguer|hire|rental/.test(blob) || amenity === 'boat_rental') return 'rental';
  if (
    /escola|school|camp|aula|lessons|coach/.test(blob) ||
    tags.office === 'educational_institution' ||
    amenity === 'school'
  ) {
    return 'surf_school';
  }
  if (tags.club === 'sport' || amenity === 'club') return 'club';
  if (shop === 'sports' || shop === 'outdoor' || leisure === 'sports_centre') {
    if (/surf|bodyboard|sup|foil/.test(blob)) return 'shop';
  }
  if (sport.includes('surfing') || /surf/.test(name)) return 'surf_school';
  return 'other';
}

function classifySports(tags: Record<string, string>, kind: DirectoryKind): DirectorySport[] {
  const blob = `${tags.sport || ''} ${tags.name || ''} ${tags.description || ''}`.toLowerCase();
  const out = new Set<DirectorySport>();
  if (/kite/.test(blob)) out.add('kitesurf');
  if (/windsurf|wind.?surf/.test(blob)) out.add('windsurf');
  if (/foil/.test(blob)) out.add('foil');
  if (/\bsup\b|stand.?up/.test(blob)) out.add('sup');
  if (/bodyboard|body board/.test(blob)) out.add('bodyboard');
  if (/wake/.test(blob)) out.add('wakeboard');
  if (/surf/.test(blob) && !/kitesurf|windsurf/.test(blob.replace(/kitesurf|windsurf/g, ''))) {
    out.add('surf');
  }
  if (out.size === 0) {
    if (kind === 'kite_center') out.add('kitesurf');
    else if (kind === 'windsurf') out.add('windsurf');
    else if (kind === 'surf_school' || kind === 'shop') out.add('surf');
  }
  return [...out];
}

function attachSpots(lat: number, lon: number, maxKm = 10, limit = 3): string[] {
  return spots
    .map((s) => ({ id: s.id, d: haversineKm(lat, lon, s.lat, s.lon) }))
    .filter((x) => x.d <= maxKm)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => x.id);
}

function nearestRegion(lat: number, lon: number): { region?: string; regionEn?: string } {
  let best = {
    d: Infinity,
    region: undefined as string | undefined,
    regionEn: undefined as string | undefined,
  };
  for (const s of spots) {
    const d = haversineKm(lat, lon, s.lat, s.lon);
    if (d < best.d) best = { d, region: s.region, regionEn: s.regionEn };
  }
  return best.d <= 80 ? { region: best.region, regionEn: best.regionEn } : {};
}

type OsmEl = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function entryFromOsm(el: OsmEl): DirectoryEntry | null {
  const tags = el.tags || {};
  const name = tags.name || tags['name:pt'] || tags['name:en'];
  if (!name || name.length < 2) return null;

  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  if (lat < 32 || lat > 43 || lon < -32 || lon > -5) return null;

  const blob = `${name} ${tags.sport || ''} ${tags.shop || ''} ${tags.leisure || ''}`.toLowerCase();
  const watersports =
    /surf|kite|windsurf|bodyboard|foil|wake|sup\b|stand.?up|paddle/.test(blob) ||
    tags.shop === 'surf' ||
    /surfing|kitesurfing|windsurfing/.test((tags.sport || '').toLowerCase());
  if (!watersports) return null;

  const kind = classifyKind(tags);
  const id = `osm-${el.type}-${el.id}`;
  const spotIds = attachSpots(lat, lon);
  const region = nearestRegion(lat, lon);

  const website = tags.website || tags['contact:website'] || tags.url;
  const phone = tags.phone || tags['contact:phone'];
  const email = tags.email || tags['contact:email'];
  const address = [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']]
    .filter(Boolean)
    .join(', ');

  return {
    id,
    slug: `${slugify(name)}-${el.id}`.slice(0, 72),
    name,
    nameEn: tags['name:en'] || undefined,
    kind,
    sports: classifySports(tags, kind),
    lat,
    lon,
    ...region,
    spotIds,
    website: website || undefined,
    phone: phone || undefined,
    email: email || undefined,
    address: address || undefined,
    source: 'osm',
    osmType: el.type,
    osmId: el.id,
    verified: false,
  };
}

function loadCurated(): DirectoryEntry[] {
  if (!existsSync(CURATED)) return [];
  const raw = JSON.parse(readFileSync(CURATED, 'utf-8')) as Array<Partial<DirectoryEntry>>;
  return raw.map((c) => {
    const lat = Number(c.lat);
    const lon = Number(c.lon);
    const spotIds = attachSpots(lat, lon);
    const region = nearestRegion(lat, lon);
    return {
      id: String(c.id),
      slug: String(c.slug || slugify(String(c.name))),
      name: String(c.name),
      nameEn: c.nameEn,
      kind: (c.kind || 'other') as DirectoryKind,
      sports: (c.sports || []) as DirectorySport[],
      lat,
      lon,
      ...region,
      spotIds,
      website: c.website,
      phone: c.phone,
      email: c.email,
      address: c.address,
      source: 'curated' as DirectorySource,
      verified: false,
    };
  });
}

/** Place a school near a VenTu spot using address/name keywords. */
function placeByText(
  blobRaw: string,
): { lat: number; lon: number; spotIds: string[]; region?: string; regionEn?: string } | null {
  const blob = blobRaw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const aliases: Array<{ re: RegExp; hint: string }> = [
    { re: /ericeira|ribeira d.?ilhas|foz do lizandro|coxos|sao lourenco/, hint: 'pescadores-ericeira' },
    { re: /peniche|baleal|ferrel|supertubos|consolacao|atouguia/, hint: 'baleal' },
    { re: /caparica|fonte da telha|sao joao da caparica/, hint: 'costa-caparica' },
    { re: /carcavelos/, hint: 'carcavelos' },
    { re: /cascais|guincho|parede|alcabideche/, hint: 'guincho' },
    { re: /colares|praia das macas|sintra|adraga/, hint: 'adraga' },
    { re: /sagres|tonel|beliche/, hint: 'tonel' },
    { re: /lagos|praia da luz|meia praia/, hint: 'lagos' },
    { re: /arrifana|aljezur|monte clerigo/, hint: 'arrifana' },
    { re: /carrapateira|bordeira|amado/, hint: 'bordeira' },
    { re: /odeceixe/, hint: 'odeceixe' },
    { re: /matosinhos/, hint: 'matosinhos' },
    { re: /esposende|ofir|apulia/, hint: 'esposende' },
    { re: /viana|cabedelo/, hint: 'cabedelo' },
    { re: /figueira/, hint: 'figueira-foz' },
    { re: /espinho/, hint: 'espinho' },
    { re: /povoa de varzim/, hint: 'povoa-varzim' },
    { re: /nazare|sao pedro de moel/, hint: 'nazare' },
    { re: /lourinha|santa cruz|praia azul|torres vedras|marteleira/, hint: 'santa-cruz' },
    { re: /sesimbra|almada|sobreda/, hint: 'costa-caparica' },
    { re: /sines|sao torpes|porto covo/, hint: 'sines' },
    { re: /comporta|carvalhal|pego/, hint: 'comporta' },
    { re: /madeira|canico|garajau|funchal/, hint: 'seixal-madeira' },
    { re: /ponta delgada|acores/, hint: 'ponta-delgada' },
    { re: /portimao|quarteira|vilamoura|albufeira|guia/, hint: 'lagos' },
    { re: /ancora/, hint: 'vila-praia-ancora' },
    { re: /ovar|esmoriz|maceda|estela/, hint: 'furadouro' },
    { re: /lisboa|linda-a-velha|queluz/, hint: 'carcavelos' },
    { re: /porto(?! covo)|miguel bombarda/, hint: 'matosinhos' },
    { re: /caldas da rainha|mestre mendo|praia do navio|bukubaki/, hint: 'santa-cruz' },
    { re: /\bluz\b|filsurf/, hint: 'lagos' },
    { re: /karma surf/, hint: 'carcavelos' },
  ];

  for (const a of aliases) {
    if (!a.re.test(blob)) continue;
    const spot = spots.find((s) => s.slug === a.hint || s.id === a.hint);
    if (spot) {
      return {
        lat: spot.lat,
        lon: spot.lon,
        spotIds: [spot.id],
        region: spot.region,
        regionEn: spot.regionEn,
      };
    }
  }

  let best: { score: number; spot: (typeof spots)[number] } | null = null;
  for (const s of spots) {
    const tokens = [s.name, s.nameEn, s.slug.replace(/-/g, ' ')].map((x) =>
      x
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase(),
    );
    for (const t of tokens) {
      if (t.length >= 4 && blob.includes(t)) {
        const score = t.length;
        if (!best || score > best.score) best = { score, spot: s };
      }
    }
  }
  if (best) {
    return {
      lat: best.spot.lat,
      lon: best.spot.lon,
      spotIds: [best.spot.id],
      region: best.spot.region,
      regionEn: best.spot.regionEn,
    };
  }
  return null;
}

function loadAesp(): DirectoryEntry[] {
  if (!existsSync(AESP)) return [];
  const raw = JSON.parse(readFileSync(AESP, 'utf-8')) as Array<{
    name: string;
    address?: string;
    phone?: string;
  }>;
  const out: DirectoryEntry[] = [];
  let placed = 0;
  let skipped = 0;
  for (const row of raw) {
    const place = placeByText(`${row.name} ${row.address || ''}`);
    if (!place) {
      skipped++;
      continue;
    }
    placed++;
    out.push({
      id: `aesp-${slugify(row.name)}`,
      slug: slugify(row.name).slice(0, 72),
      name: row.name,
      kind: /kite/i.test(row.name) ? 'kite_center' : 'surf_school',
      sports: /kite/i.test(row.name)
        ? ['kitesurf', 'surf']
        : /bodyboard|bb academy/i.test(row.name)
          ? ['surf', 'bodyboard']
          : ['surf'],
      lat: place.lat,
      lon: place.lon,
      region: place.region,
      regionEn: place.regionEn,
      spotIds: place.spotIds,
      phone: row.phone,
      address: row.address,
      source: 'curated',
      verified: false,
    });
  }
  console.log(`  AESP placed: ${placed} · skipped (no geo match): ${skipped}`);
  return out;
}

/** One stub per spot that lists escola/aluguer — only used when OSM is thin. */
function stubsFromSpotFacilities(): DirectoryEntry[] {
  const out: DirectoryEntry[] = [];
  for (const s of spots) {
    const fac = (s.facilities || []).join(' ').toLowerCase();
    const hasSchool = /escola|school|kite|aluguer|cable park/.test(fac);
    if (!hasSchool) continue;

    let kind: DirectoryKind = 'surf_school';
    const sports: DirectorySport[] = [];
    if (/kite/.test(fac)) {
      kind = 'kite_center';
      sports.push('kitesurf');
    }
    if (/windsurf/.test(fac)) {
      kind = 'windsurf';
      sports.push('windsurf');
    }
    if (/wake|cable/.test(fac)) sports.push('wakeboard');
    if (/surf/.test(fac) || kind === 'surf_school') sports.push('surf');
    if (/foil/.test(fac)) sports.push('foil');
    if (sports.length === 0) sports.push('surf');

    out.push({
      id: `spot-facilities-${s.id}`,
      slug: `escolas-${s.slug}`.slice(0, 72),
      name: `Escolas / lojas — ${s.name}`,
      nameEn: `Schools / shops — ${s.nameEn}`,
      kind,
      sports: [...new Set(sports)],
      lat: s.lat,
      lon: s.lon,
      region: s.region,
      regionEn: s.regionEn,
      spotIds: [s.id],
      source: 'curated',
      verified: false,
    });
  }
  return out;
}

async function overpassOnce(url: string, query: string): Promise<OsmEl[]> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Accept: 'application/json',
      'User-Agent': 'VenTuDirectory/1.0 (https://ventu.surf; directory seed)',
    },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { elements?: OsmEl[] };
  return data.elements || [];
}

async function fetchOverpassRegion(regionName: string, bbox: string): Promise<OsmEl[]> {
  const query = buildRegionQuery(bbox);
  let lastErr: Error | null = null;
  for (const url of OVERPASS_URLS) {
    try {
      const elements = await overpassOnce(url, query);
      console.log(`    ${regionName}: ${elements.length} (@ ${new URL(url).hostname})`);
      return elements;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      console.warn(`    ${regionName} ⚠️ ${new URL(url).hostname}: ${lastErr.message}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  console.warn(`    ${regionName}: failed — ${lastErr?.message || 'unknown'}`);
  return [];
}

async function fetchOverpass(): Promise<OsmEl[]> {
  const byKey = new Map<string, OsmEl>();
  console.log(`  Overpass by region (${REGIONS.length} boxes)…`);
  for (const r of REGIONS) {
    const els = await fetchOverpassRegion(r.name, r.bbox);
    for (const el of els) {
      byKey.set(`${el.type}/${el.id}`, el);
    }
    await new Promise((res) => setTimeout(res, 1200));
  }
  return [...byKey.values()];
}

function dedupe(entries: DirectoryEntry[]): DirectoryEntry[] {
  const byId = new Map<string, DirectoryEntry>();
  for (const e of entries) {
    if (!byId.has(e.id)) byId.set(e.id, e);
  }

  const list = [...byId.values()];
  const kept: DirectoryEntry[] = [];
  for (const e of list) {
    const dup = kept.find(
      (k) =>
        k.name.toLowerCase() === e.name.toLowerCase() &&
        haversineKm(k.lat, k.lon, e.lat, e.lon) < 0.4,
    );
    if (dup) {
      if (e.source === 'osm' && dup.source !== 'osm') {
        kept[kept.indexOf(dup)] = e;
      } else if (e.source === 'curated' && dup.source === 'curated' && !dup.id.startsWith('spot-')) {
        kept[kept.indexOf(dup)] = e;
      }
      continue;
    }
    kept.push(e);
  }
  return kept.sort((a, b) => a.name.localeCompare(b.name, 'pt'));
}

async function main() {
  console.log('🏫 VenTu — directory fetch (OSM + curated)\n');

  const curatedNamed = loadCurated();
  const aesp = loadAesp();
  console.log(`  Curated named: ${curatedNamed.length}`);

  let osmEntries: DirectoryEntry[] = [];
  if (process.env.DIRECTORY_SKIP_OSM === '1') {
    console.log('  OSM skipped (DIRECTORY_SKIP_OSM=1)');
  } else {
    try {
      const elements = await fetchOverpass();
      console.log(`  OSM elements (deduped raw): ${elements.length}`);
      for (const el of elements) {
        const entry = entryFromOsm(el);
        if (entry) osmEntries.push(entry);
      }
      console.log(`  OSM entries kept: ${osmEntries.length}`);
    } catch (e) {
      console.warn(`  ⚠️ OSM fetch failed — using curated only: ${(e as Error).message}`);
    }
  }

  // Named businesses first; facility stubs only if still thin
  const namedCount = curatedNamed.length + aesp.length + osmEntries.length;
  const stubs = namedCount < 100 ? stubsFromSpotFacilities() : [];
  if (stubs.length) {
    console.log(`  Spot facility stubs (fallback): ${stubs.length}`);
  } else {
    console.log('  Spot facility stubs: skipped (named coverage OK)');
  }

  const entries = dedupe([...aesp, ...curatedNamed, ...osmEntries, ...stubs]);
  const cleaned = entries.filter((e) => {
    if (!e.id.startsWith('spot-facilities-')) return true;
    const hasRealNearby = entries.some(
      (o) =>
        o.id !== e.id &&
        !o.id.startsWith('spot-facilities-') &&
        haversineKm(e.lat, e.lon, o.lat, o.lon) < 1.5,
    );
    return !hasRealNearby;
  });

  const sources = [
    osmEntries.length && 'osm',
    aesp.length && 'aesp',
    curatedNamed.length && 'curated',
  ]
    .filter(Boolean)
    .join('+');

  const file: DirectoryFile = {
    generatedAt: new Date().toISOString(),
    source: sources || 'curated',
    count: cleaned.length,
    entries: cleaned,
  };

  mkdirSync(join(process.cwd(), 'public', 'data'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(file, null, 2));
  console.log(`\n✅ Wrote ${cleaned.length} entries → ${OUT}`);
  const bySource: Record<string, number> = {};
  for (const e of cleaned) bySource[e.source] = (bySource[e.source] || 0) + 1;
  console.log('  by source:', bySource);
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
