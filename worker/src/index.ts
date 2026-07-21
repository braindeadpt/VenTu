export interface Env {
  ECOWITT_APPLICATION_KEY: string;
  ECOWITT_API_KEY: string;
  ECOWITT_MAC: string;
  ECOWITT_LAT: string;
  ECOWITT_LON: string;
  ECOWITT_NAME: string;
  ALLOWED_ORIGINS: string;
}

const MAX_DIST_KM = 30;
const MAX_AGE_H = 3;
const SOURCE_TIE_KM = 8;
const IPMA_OBS =
  'https://api.ipma.pt/open-data/observation/meteorology/stations/observations.json';
const IPMA_ST =
  'https://api.ipma.pt/open-data/observation/meteorology/stations/stations.json';
const METAR_IDS =
  'LPPT,LPCS,LPMT,LPPR,LPOV,LPFR,LPMA,LPPS,LPPD,LPLA,LPHR,LPFL,LPGR,LPSJ,LPPI,LPAZ';
const METAR_API =
  'https://aviationweather.gov/api/data/metar?format=json&hours=2&ids=' + METAR_IDS;

/** Static coastal/island airports (same catalog as scripts/lib/metar.js). */
const METAR_STATIONS: { icao: string; name: string; lat: number; lon: number }[] = [
  { icao: 'LPPT', name: 'Lisboa (METAR)', lat: 38.781, lon: -9.136 },
  { icao: 'LPCS', name: 'Cascais (METAR)', lat: 38.725, lon: -9.355 },
  { icao: 'LPMT', name: 'Montijo (METAR)', lat: 38.704, lon: -9.036 },
  { icao: 'LPPR', name: 'Porto (METAR)', lat: 41.235, lon: -8.684 },
  { icao: 'LPOV', name: 'Ovar (METAR)', lat: 40.916, lon: -8.646 },
  { icao: 'LPFR', name: 'Faro (METAR)', lat: 37.014, lon: -7.966 },
  { icao: 'LPMA', name: 'Madeira (METAR)', lat: 32.698, lon: -16.774 },
  { icao: 'LPPS', name: 'Porto Santo (METAR)', lat: 33.073, lon: -16.35 },
  { icao: 'LPPD', name: 'Ponta Delgada (METAR)', lat: 37.741, lon: -25.698 },
  { icao: 'LPLA', name: 'Lajes (METAR)', lat: 38.762, lon: -27.091 },
  { icao: 'LPHR', name: 'Horta (METAR)', lat: 38.52, lon: -28.716 },
  { icao: 'LPFL', name: 'Flores (METAR)', lat: 39.455, lon: -31.131 },
  { icao: 'LPGR', name: 'Graciosa (METAR)', lat: 39.092, lon: -28.03 },
  { icao: 'LPSJ', name: 'São Jorge (METAR)', lat: 38.666, lon: -28.176 },
  { icao: 'LPPI', name: 'Pico (METAR)', lat: 38.554, lon: -28.441 },
  { icao: 'LPAZ', name: 'Santa Maria (METAR)', lat: 36.971, lon: -25.171 },
];

const SOURCE_RANK: Record<string, number> = { ecowitt: 0, ipma: 1, metar: 2 };

function hav(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371;
  const r = Math.PI / 180;
  const dLa = (la2 - la1) * r;
  const dLo = (lo2 - lo1) * r;
  const a =
    Math.sin(dLa / 2) ** 2 +
    Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function cardinal(deg: number): string {
  const d = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];
  return d[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

const IPMA_DIR: Record<number, number | null> = {
  0: null,
  1: 0,
  2: 45,
  3: 90,
  4: 135,
  5: 180,
  6: 225,
  7: 270,
  8: 315,
  9: 0,
};

function ageH(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3.6e6;
}

async function cachedJson(
  url: string,
  ttl: number,
  key: string,
  ctx: ExecutionContext,
  validate?: (j: unknown) => boolean,
): Promise<unknown> {
  const cache = caches.default;
  const ck = new Request('https://cache.local/' + encodeURIComponent(key));
  const hit = await cache.match(ck);
  if (hit) return hit.json();

  const r = await fetch(url, { headers: { 'User-Agent': 'VenTu-Worker' } });
  if (!r.ok) throw new Error('http ' + r.status);

  const text = await r.text();
  const json = JSON.parse(text) as unknown;
  if (!validate || validate(json)) {
    ctx.waitUntil(
      cache.put(
        ck,
        new Response(text, {
          headers: {
            'Cache-Control': 'max-age=' + ttl,
            'Content-Type': 'application/json',
          },
        }),
      ),
    );
  }
  return json;
}

type Obs = {
  windSpeedKt: number;
  windDirDeg: number | null;
  windCardinal: string | null;
  tempC: number | null;
  stationName: string;
  distanceKm: number;
  observedAt: string;
  source: 'ipma' | 'ecowitt' | 'metar';
};

async function ipmaObserved(
  lat: number,
  lon: number,
  ctx: ExecutionContext,
): Promise<Obs | null> {
  const [stations, obs] = (await Promise.all([
    cachedJson(IPMA_ST, 3600, 'ipma-st', ctx),
    cachedJson(IPMA_OBS, 900, 'ipma-obs', ctx),
  ])) as [unknown[], Record<string, Record<string, IpmaRow>>];

  const times = Object.keys(obs).sort();
  if (!times.length) return null;

  const list = stations
    .map((s) => {
      const st = s as IpmaStation;
      return {
        id: String(st.properties.idEstacao),
        name: st.properties.localEstacao,
        lon: st.geometry.coordinates[0],
        lat: st.geometry.coordinates[1],
      };
    })
    .map((s) => ({ ...s, dist: hav(lat, lon, s.lat, s.lon) }))
    .sort((a, b) => a.dist - b.dist);

  for (const st of list) {
    if (st.dist > MAX_DIST_KM) break;
    for (let i = times.length - 1; i >= 0 && i >= times.length - 4; i--) {
      const rec = obs[times[i]]?.[st.id];
      if (!rec) continue;
      const ws = rec.intensidadeVento;
      if (ws == null || ws <= -99) continue;
      const iso = times[i].length <= 16 ? times[i] + ':00Z' : times[i];
      if (ageH(iso) > MAX_AGE_H) continue;
      const dirId = rec.idDireccVento ?? 0;
      const deg = IPMA_DIR[dirId] ?? null;
      return {
        windSpeedKt: Math.round(ws * 1.94384),
        windDirDeg: deg,
        windCardinal: deg == null ? null : cardinal(deg),
        tempC: rec.temperatura != null && rec.temperatura > -99 ? rec.temperatura : null,
        stationName: st.name,
        distanceKm: Math.round(st.dist * 10) / 10,
        observedAt: iso,
        source: 'ipma',
      };
    }
  }
  return null;
}

async function ecowittObserved(
  lat: number,
  lon: number,
  env: Env,
  ctx: ExecutionContext,
): Promise<Obs | null> {
  const elat = parseFloat(env.ECOWITT_LAT);
  const elon = parseFloat(env.ECOWITT_LON);
  const dist = hav(lat, lon, elat, elon);
  if (dist > MAX_DIST_KM) return null;

  const u =
    `https://api.ecowitt.net/api/v3/device/real_time?application_key=${env.ECOWITT_APPLICATION_KEY}` +
    `&api_key=${env.ECOWITT_API_KEY}&mac=${encodeURIComponent(env.ECOWITT_MAC)}&call_back=all&temp_unitid=1&wind_speed_unitid=6`;

  const j = (await cachedJson(u, 300, 'ecowitt-rt', ctx, (x) =>
    Number((x as { code?: unknown })?.code) === 0,
  )) as EcowittResponse;

  console.log('ecowitt code/msg:', j?.code, j?.msg);
  if (Number(j.code) !== 0 || !j.data?.wind) return null;

  const w = j.data.wind;
  const ws = parseFloat(String(w.wind_speed?.value));
  const deg = parseFloat(String(w.wind_direction?.value));
  const t = j.data.outdoor?.temperature?.value;
  const observedAt = new Date(
    (Number(j.time) || Math.floor(Date.now() / 1000)) * 1000,
  ).toISOString();
  if (ageH(observedAt) > MAX_AGE_H) return null;

  return {
    windSpeedKt: Math.round(ws * 1.94384),
    windDirDeg: Number.isNaN(deg) ? null : deg,
    windCardinal: Number.isNaN(deg) ? null : cardinal(deg),
    tempC: t != null ? parseFloat(String(t)) : null,
    stationName: env.ECOWITT_NAME,
    distanceKm: Math.round(dist * 10) / 10,
    observedAt,
    source: 'ecowitt',
  };
}

type MetarRow = {
  icaoId?: string;
  obsTime?: number;
  wspd?: number;
  wdir?: number;
  temp?: number;
};

async function metarObserved(
  lat: number,
  lon: number,
  ctx: ExecutionContext,
): Promise<Obs | null> {
  const rows = (await cachedJson(METAR_API, 600, 'metar-pt', ctx, (x) =>
    Array.isArray(x),
  )) as MetarRow[];

  const byIcao = new Map<string, MetarRow>();
  for (const row of rows) {
    if (!row?.icaoId) continue;
    const prev = byIcao.get(row.icaoId);
    const t = Number(row.obsTime) || 0;
    const prevT = prev ? Number(prev.obsTime) || 0 : 0;
    if (!prev || t >= prevT) byIcao.set(row.icaoId, row);
  }

  const nearby = METAR_STATIONS.map((s) => ({
    ...s,
    dist: hav(lat, lon, s.lat, s.lon),
  }))
    .filter((s) => s.dist <= MAX_DIST_KM)
    .sort((a, b) => a.dist - b.dist);

  for (const st of nearby) {
    const row = byIcao.get(st.icao);
    if (!row) continue;
    const wspd = Number(row.wspd);
    if (!Number.isFinite(wspd) || wspd < 0) continue;
    const obsSec = Number(row.obsTime);
    if (!Number.isFinite(obsSec)) continue;
    const observedAt = new Date(obsSec * 1000).toISOString();
    if (ageH(observedAt) > MAX_AGE_H) continue;
    const wdir = Number(row.wdir);
    const hasDir = Number.isFinite(wdir) && wdir >= 0 && wdir <= 360;
    const tempC = Number(row.temp);
    return {
      windSpeedKt: Math.round(wspd),
      windDirDeg: hasDir ? wdir : null,
      windCardinal: hasDir ? cardinal(wdir) : null,
      tempC: Number.isFinite(tempC) ? tempC : null,
      stationName: st.name,
      distanceKm: Math.round(st.dist * 10) / 10,
      observedAt,
      source: 'metar',
    };
  }
  return null;
}

function pickBestObs(cands: Obs[]): Obs | null {
  if (!cands.length) return null;
  cands.sort((a, b) => {
    const dist = a.distanceKm - b.distanceKm;
    if (Math.abs(dist) > SOURCE_TIE_KM) return dist;
    const rank =
      (SOURCE_RANK[a.source] ?? 9) - (SOURCE_RANK[b.source] ?? 9);
    if (rank !== 0) return rank;
    if (Math.abs(dist) > 0.05) return dist;
    return new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime();
  });
  return cands[0];
}

function cors(origin: string | null, allowed: string): Record<string, string> {
  const list = allowed.split(',');
  const ok = origin && list.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : list[0],
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Cache-Control': 'public, max-age=300',
  };
}

interface IpmaStation {
  geometry: { coordinates: [number, number] };
  properties: { idEstacao: number; localEstacao: string };
}

interface IpmaRow {
  intensidadeVento?: number;
  idDireccVento?: number;
  temperatura?: number;
}

interface EcowittResponse {
  code?: unknown;
  msg?: unknown;
  time?: string | number;
  data?: {
    wind?: {
      wind_speed?: { value?: string | number };
      wind_direction?: { value?: string | number };
    };
    outdoor?: { temperature?: { value?: string | number } };
  };
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = req.headers.get('Origin');
    const h = {
      ...cors(origin, env.ALLOWED_ORIGINS),
      'Content-Type': 'application/json',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: h });

    const url = new URL(req.url);
    if (url.pathname !== '/obs') {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: h,
      });
    }

    const lat = parseFloat(url.searchParams.get('lat') || '');
    const lon = parseFloat(url.searchParams.get('lon') || '');
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return new Response(JSON.stringify({ error: 'lat/lon required' }), {
        status: 400,
        headers: h,
      });
    }

    const [ipma, eco, metar] = await Promise.all([
      ipmaObserved(lat, lon, ctx).catch((e) => {
        console.log('ipma err', String(e));
        return null;
      }),
      ecowittObserved(lat, lon, env, ctx).catch((e) => {
        console.log('eco err', String(e));
        return null;
      }),
      metarObserved(lat, lon, ctx).catch((e) => {
        console.log('metar err', String(e));
        return null;
      }),
    ]);

    const cands = [ipma, eco, metar].filter(Boolean) as Obs[];
    return new Response(JSON.stringify({ observed: pickBestObs(cands) }), { headers: h });
  },
};
