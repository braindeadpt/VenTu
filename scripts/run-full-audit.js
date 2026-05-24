#!/usr/bin/env node
/**
 * Full project audit — build, unit tests, Playwright E2E — zero manual steps.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function run(label, command, args, opts = {}) {
  console.log(`\n${'='.repeat(60)}\n▶ ${label}\n${'='.repeat(60)}\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...opts.env },
  });
  if (result.status !== 0) {
    console.error(`\n❌ ${label} failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
  console.log(`\n✅ ${label} passed`);
}

console.log('VenTu — auditoria completa automatizada\n');

run('Build static export', 'npm', ['run', 'build']);
run('Unit tests (Vitest)', 'npm', ['run', 'test']);
run('Playwright E2E audit', 'npx', ['playwright', 'test'], {
  env: { CI: '1' },
});

const reportDir = path.join(root, 'playwright-report');
if (fs.existsSync(reportDir)) {
  console.log(`\n📊 Relatório HTML: ${reportDir}/index.html`);
}

console.log('\n🎉 Auditoria completa concluída com sucesso.\n');
