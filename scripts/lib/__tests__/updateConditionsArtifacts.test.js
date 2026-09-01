import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readJsonIfExists, atomicWriteJson, ensureParentDir } = require('../updateConditionsArtifacts.js');

let tmpDir;
afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

function makeDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ventu-update-artifacts-'));
  return tmpDir;
}

describe('updateConditionsArtifacts', () => {
  it('reads JSON, returns fallback when absent or invalid, and reports parse failures', () => {
    const dir = makeDir();
    const missing = path.join(dir, 'missing.json');
    expect(readJsonIfExists(missing, { fallback: true })).toEqual({ fallback: true });

    const invalid = path.join(dir, 'invalid.json');
    fs.writeFileSync(invalid, '{broken', 'utf8');
    const errors = [];
    expect(readJsonIfExists(invalid, [], (_error, file) => errors.push(file))).toEqual([]);
    expect(errors).toEqual([invalid]);
  });

  it('writes atomically and keeps the previous artifact as backup', () => {
    const dir = makeDir();
    const file = path.join(dir, 'nested', 'conditions.json');
    ensureParentDir(file);
    atomicWriteJson(file, { version: 1 });
    atomicWriteJson(file, { version: 2 });

    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ version: 2 });
    expect(JSON.parse(fs.readFileSync(`${file}.backup`, 'utf8'))).toEqual({ version: 1 });
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });
});
