import { cartoBasemapKey } from '@/lib/map-constants';

/**
 * Opens the connection to the raster-tile CDN before Leaflet hydrates and
 * fires its first tile requests. Every Leaflet mount on the site is inside an
 * `ssr:false` dynamic chunk, so a `<link>` added only at hydration is too late
 * to help — the preconnect has to be in the SSR HTML. The app router hoists
 * these `<link>` tags into `<head>` no matter where they render.
 *
 * Host set mirrors getMapRasterBasemap / useMapCore's basemap attach:
 *  - `server.arcgisonline.com` is always possible — the raster basemap in
 *    keyless builds, plus the satellite layer and the Carto→Esri failure
 *    fallback in keyed builds.
 *  - The four Carto subdomains (`{s}` = a–d rotation) only exist when the
 *    Carto key is configured; a keyless build would never contact them, so
 *    they are only preconnected when the key is present.
 *
 * Tiles load as no-cors `<img>` requests, so there is deliberately no
 * `crossOrigin` attribute: a CORS-mode preconnect opens a second connection
 * that no-cors image loads cannot reuse.
 */
const CARTO_SUBDOMAINS = ['a', 'b', 'c', 'd'] as const;
const ESRI_ORIGIN = 'https://server.arcgisonline.com';

export default function MapTilePreconnect() {
  const origins = cartoBasemapKey()
    ? [
        ...CARTO_SUBDOMAINS.map((s) => `https://${s}.basemaps.cartocdn.com`),
        ESRI_ORIGIN,
      ]
    : [ESRI_ORIGIN];

  return (
    <>
      {origins.map((href) => (
        <link key={href} rel="preconnect" href={href} />
      ))}
    </>
  );
}
