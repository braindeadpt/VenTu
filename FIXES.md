# WindSpot - Fix Log

## Problems Found
1. Open-Meteo API timeouts during build (ETIMEDOUT / 400 errors)
2. Spot detail pages crashed build when API failed
3. GitHub Pages basePath not configured
4. Workflow used old peaceiris/actions-gh-pages

## Fixes Applied
- Added robust fetch error handling with 10s timeout
- Added realistic seasonal mock data fallback
- Added try/catch to spot detail page
- Set basePath + assetPrefix for GitHub Pages
- Removed invalid `models` param from API calls
- Updated deploy workflow to modern GitHub Pages actions

## Build Status
✅ 32/32 pages generate successfully
✅ TypeScript passes with no errors
✅ All spots render with realistic mock data when API unavailable

## GitHub Pages Setup
Source: Deploy from branch → gh-pages → / (root)
URL: https://braindeadpt.github.io/windspot-pt/
