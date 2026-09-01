const fs = require('fs');
const path = require('path');

function readJsonIfExists(filePath, fallback, onError) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    onError?.(error, filePath);
    return fallback;
  }
}

function atomicWriteJson(filePath, content) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(content), 'utf-8');
  const backupPath = `${filePath}.backup`;
  if (fs.existsSync(filePath)) fs.copyFileSync(filePath, backupPath);
  fs.renameSync(tmpPath, filePath);
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

module.exports = { readJsonIfExists, atomicWriteJson, ensureParentDir };
