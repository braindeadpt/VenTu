/** @type {import('next').NextConfig} */
const os = require('os')

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
