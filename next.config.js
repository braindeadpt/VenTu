/** @type {import('next').NextConfig} */
const os = require('os')

// Audit 2026-11-21 (baixa) / review #527: NEXT_PUBLIC_SITE_URL é obrigatória
// em CI. Validar aqui garante que o build falha mesmo quando nenhum helper
// que a lê (ex. getSiteOrigin) corre durante o static export.
if (process.env.CI && !process.env.NEXT_PUBLIC_SITE_URL) {
  throw new Error(
    'NEXT_PUBLIC_SITE_URL is required in CI (e.g. https://ventu.surf)',
  )
}

const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  transpilePackages: ['geist', 'leaflet'],
  reactStrictMode: true,
  experimental: {
    // Use every available core for static generation (default is cores - 1,
    // which caps at 3 workers on the 4-core CI/local runners). Capped at 8 to
    // keep per-worker memory (each parses ~8MB of forecast data) reasonable on
    // large machines.
    cpus: Math.min(os.cpus().length, 8),
  },
}

module.exports = nextConfig
