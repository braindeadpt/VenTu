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
const IPMA_OBS =
  'https://api.ipma.pt/open-data/observation/meteorology/stations/observations.json';
const IPMA_ST =
  'https://api.ipma.pt/open-data/observation/meteorology/stations/stations.json';

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
  source: 'ipma' | 'ecowitt';
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

    const [ipma, eco] = await Promise.all([
      ipmaObserved(lat, lon, ctx).catch((e) => {
        console.log('ipma err', String(e));
        return null;
      }),
      ecowittObserved(lat, lon, env, ctx).catch((e) => {
        console.log('eco err', String(e));
        return null;
      }),
    ]);

    const cands = [ipma, eco].filter(Boolean) as Obs[];
    cands.sort((a, b) => a.distanceKm - b.distanceKm);
    return new Response(JSON.stringify({ observed: cands[0] ?? null }), { headers: h });
  },
};
