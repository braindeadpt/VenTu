/**
 * CI guard: the URL-segment validator suites must run with their expected
 * test counts. Each validator has (a) a script wired into ci.yml, (b) an
 * entry in the vitest.config include list, and (c) a fixture test file.
 * Deleting any of the three would silently shrink the suite — this fails
 * the build instead of letting a dropped guard pass unnoticed.
 *
 * Runs ONLY the three small slug-guard suites (a few seconds) through
 * vitest's JSON reporter and asserts, per file: present, zero failures,
 * and the exact expected number of tests. Expected counts change only when
 * a guard suite intentionally grows — bump them here in that commit.
 *
 * Usage: node scripts/check-guard-test-counts.js
 *   exit 0 = all guard suites green with expected counts
 */

const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** file → expected number of tests. Keep in sync with the actual suites. */
const EXPECTED = {
  'scripts/lib/__tests__/validateSpots.test.js': 5,
  'scripts/lib/__tests__/validatePageSlugs.test.js': 7,
  'scripts/lib/__tests__/validateNewsLivecams.test.js': 6,
};

const files = Object.keys(EXPECTED);

let raw;
try {
  raw = execSync(
    `npx vitest run --reporter=json ${files.map((f) => `"${f}"`).join(' ')}`,
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, shell: true },
  );
} catch (e) {
  console.error(`❌ check-guard-test-counts: vitest failed or a suite errored\n${e.stdout || ''}${e.stderr || ''}`);
  process.exit(1);
}

let report;
try {
  // vitest may print the JSON after non-JSON banner lines — take the last JSON.
  const lastJson = raw.trim().split('\n').filter((l) => l.trim().startsWith('{')).pop();
  report = JSON.parse(lastJson);
} catch (e) {
  console.error(`❌ check-guard-test-counts: could not parse vitest JSON output\n${raw.slice(0, 2000)}`);
  process.exit(1);
}

if (report.numFailedTestSuites > 0 || report.numFailedTests > 0) {
  console.error(`❌ check-guard-test-counts: ${report.numFailedTestSuites} failed suite(s), ${report.numFailedTests} failed test(s)`);
  process.exit(1);
}

const errors = [];
for (const file of files) {
  const suite = (report.testResults || []).find((r) => r.name.includes(file.replace(/\\/g, '/')));
  const expected = EXPECTED[file];
  if (!suite) {
    errors.push(`${file}: suite did not run — is it still in vitest.config include?`);
    continue;
  }
  const got = (suite.assertionResults || []).length;
  if (got !== expected) {
    errors.push(`${file}: expected ${expected} tests, ran ${got} — dropped tests or stale EXPECTED count`);
  }
}

if (errors.length > 0) {
  console.error(`❌ check-guard-test-counts: ${errors.length} issue(s)\n`);
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

const total = Object.values(EXPECTED).reduce((a, b) => a + b, 0);
console.log(`✅ check-guard-test-counts: ${files.length} guard suites OK — ${total} expected tests all present and passing`);
