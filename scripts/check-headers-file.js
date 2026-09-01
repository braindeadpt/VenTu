#!/usr/bin/env node
/**
 * Validates that public/_headers contains all required security directives.
 * Run after build to prove the _headers file lands in out/ and is complete.
 *
 * Usage: node scripts/check-headers-file.js [--path <path-to-_headers>]
 *
 * Exits 0 if all required headers are present, 1 otherwise.
 * This does NOT verify HTTP headers are served (that requires a real server
 * that interprets _headers, like Cloudflare Pages or Netlify). It only
 * validates the file's contents so a missing directive fails the build.
 */
const fs = require('fs');
const path = require('path');

const headersPath = process.argv.includes('--path')
  ? process.argv[process.argv.indexOf('--path') + 1]
  : path.join(process.cwd(), 'public', '_headers');

const required = [
  { pattern: /X-Content-Type-Options:\s*nosniff/i, name: 'X-Content-Type-Options: nosniff' },
  { pattern: /X-Frame-Options:\s*DENY/i, name: 'X-Frame-Options: DENY' },
  { pattern: /Referrer-Policy:\s*strict-origin-when-cross-origin/i, name: 'Referrer-Policy: strict-origin-when-cross-origin' },
  { pattern: /Permissions-Policy:\s*camera=\(\)/i, name: 'Permissions-Policy (camera)' },
  { pattern: /Strict-Transport-Security:\s*max-age=31536000.*preload/i, name: 'Strict-Transport-Security (preload)' },
];

if (!fs.existsSync(headersPath)) {
  console.error(`✗ _headers file not found: ${headersPath}`);
  process.exit(1);
}

const content = fs.readFileSync(headersPath, 'utf8');
const missing = required.filter((r) => !r.pattern.test(content));

if (missing.length === 0) {
  console.log(`✓ _headers complete (${required.length}/${required.length} directives present)`);
  process.exit(0);
} else {
  console.error(`✗ _headers missing ${missing.length} directive(s):`);
  for (const m of missing) console.error(`  - ${m.name}`);
  process.exit(1);
}
