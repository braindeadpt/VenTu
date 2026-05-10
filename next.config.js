/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  basePath: process.env.NODE_ENV === 'production' ? '/windspot-pt' : '',
  assetPrefix: process.env.NODE_ENV === 'production' ? '/windspot-pt' : '',
  eslint: { ignoreDuringBuilds: true },
}

module.exports = nextConfig
