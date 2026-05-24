'use client';

// FIX S4: Content Security Policy meta tag
// For static exports, CSP must be in HTML meta tag (not HTTP headers)

// CSP — keep narrow. Static export means meta tag, not header.
// We allow:
//  - GoatCounter (analytics, optional)
//  - Supabase (contributions feedback + admin, optional)
//  - OpenStreetMap / Carto / ESRI tiles (Leaflet basemaps)
//  - Windy webcams (iframe embed in spot detail)
// NOTE: 'unsafe-eval' was removed (was unused; lingered from a copy/paste).
// 'unsafe-inline' for scripts is still required by the pre-hydration
// theme script in app/layout.tsx and Next.js inline runtime.
const CSP_META = {
  defaultSrc: "'self'",
  scriptSrc: "'self' 'unsafe-inline' https://gc.zgo.at",
  styleSrc: "'self' 'unsafe-inline'",
  fontSrc: "'self' data:",
  imgSrc: "'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com https://*.supabase.co",
  connectSrc: "'self' https://gc.zgo.at https://*.supabase.co wss://*.supabase.co https://api.open-meteo.com https://marine-api.open-meteo.com https://api.windy.com",
  frameSrc: "https://embed.windy.com https://*.windy.com https://www.openstreetmap.org",
  objectSrc: "'none'",
  baseUri: "'self'",
  formAction: "'self'",
  frameAncestors: "'none'",
  upgradeInsecureRequests: '',
};

// camelCase → kebab-case (CSP directives are kebab-case in the spec).
const toKebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

export default function CSPMeta() {
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