import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'scripts/lib/__tests__/ecowitt.normalize.test.js',
      'scripts/lib/__tests__/metar.test.js',
      'scripts/lib/__tests__/windBlend.test.js',
      'scripts/lib/__tests__/htmlEscape.test.js',
      'scripts/lib/__tests__/analyzeScoreFeedback.test.js',
      'scripts/lib/__tests__/ipma.test.js',
      'scripts/lib/__tests__/spamFilter.test.js',
      'scripts/lib/__tests__/safeUrl.test.js',
      'scripts/lib/__tests__/fetchRss.test.js',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
