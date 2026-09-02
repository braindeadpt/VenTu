'use client';

// FIX S4: Content Security Policy meta tag
// For static exports, CSP must be in HTML meta tag (not HTTP headers)

// CSP — keep narrow. Static export means meta tag, not header.
// We allow:
//  - GoatCounter (analytics, optional)
//  - Supabase (contributions feedback + admin, optional)
//  - OpenStreetMap / Carto / ESRI tiles (Leaflet basemaps)
//  - Curated spot iframes: WeatherLink (Cabedelo), YouTube livecams, Surfline (wake park)
// NOTE: 'unsafe-eval' is omitted in production (not needed for static export).
// React dev requires eval() — this meta is skipped when NODE_ENV !== 'production'.
// 'unsafe-inline' for scripts is still required by the pre-hydration theme script in app/layout.tsx.
// frame-ancestors is deliberately NOT in this meta: browsers ignore it in <meta>
// (console error on every page load) and it is only honoured as an HTTP header.
// S7: served as a real HTTP header via the Cloudflare proxy in front of ventu.surf
// (docs/SECURITY-HEADERS.md) and in public/_headers — anti-clickjacking lives
// there (X-Frame-Options: DENY + frame-ancestors 'none', embed allowed on /embed/*).
const CSP_META = {
  defaultSrc: "'self'",
  scriptSrc: "'self' 'unsafe-inline' https://gc.zgo.at",
  styleSrc: "'self' 'unsafe-inline'",
  fontSrc: "'self' data:",
  imgSrc: "'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com https://*.supabase.co",
  connectSrc: "'self' https://gc.zgo.at https://*.goatcounter.com https://*.supabase.co wss://*.supabase.co https://api.open-meteo.com https://marine-api.open-meteo.com https://*.workers.dev",
  frameSrc:
    "'self' https://www.openstreetmap.org https://www.youtube-nocookie.com https://www.youtube.com https://www.weatherlink.com https://embed.cdn-surfline.com",
  objectSrc: "'none'",
  baseUri: "'self'",
  formAction: "'self'",
  upgradeInsecureRequests: '',
};

// camelCase → kebab-case (CSP directives are kebab-case in the spec).
const toKebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

export default function CSPMeta() {
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  const cspValue = Object.entries(CSP_META)
    .map(([key, value]) =>
      value === '' ? toKebab(key) : `${toKebab(key)} ${value}`
    )
    .join('; ');

  return (
    <meta
      httpEquiv="Content-Security-Policy"
      content={cspValue}
    />
  );
}