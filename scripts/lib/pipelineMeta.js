/**
 * Authoritative pipeline timestamps for trust surfaces (hero ticker, stale checks).
 * Written on every successful full or observations run.
 */
const fs = require('fs');
const path = require('path');

const META_FILENAME = 'pipeline-meta.json';

/** @typedef {'full' | 'observations'} PipelineRunMode */

/**
 * @param {string} [rootDir]
 * @returns {string}
 */
function getMetaPath(rootDir = path.join(__dirname, '..', '..')) {
  return path.join(rootDir, 'public', 'data', META_FILENAME);
}

/**
 * @returns {{
 *   fullUpdatedAt?: string;
 *   observationsUpdatedAt?: string;
 *   lastRunAt?: string;
 *   lastRunMode?: PipelineRunMode;
 *   displayUpdatedAt?: string;
 * } | null}
 */
function readPipelineMeta(rootDir) {
  const metaPath = getMetaPath(rootDir);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * @param {PipelineRunMode} mode
 * @param {Date} [now]
 * @param {string} [rootDir]
 * @param {object} [extra] extra fields merged into the meta (e.g. buoyLayer
 *   status for diagnostics). Written after the timestamps so callers can pass
 *   values derived from the same run.
 */
function writePipelineMeta(mode, now = new Date(), rootDir, extra = {}) {
  const iso = now.toISOString();
  const prev = readPipelineMeta(rootDir) || {};
  const next = {
    ...prev,
    lastRunAt: iso,
    lastRunMode: mode,
  };

  if (mode === 'full') {
    next.fullUpdatedAt = iso;
    next.displayUpdatedAt = iso;
  } else {
    next.observationsUpdatedAt = iso;
    // Hero ticker: reflect latest publish (obs merge or full forecast).
    next.displayUpdatedAt = iso;
  }

  Object.assign(next, extra);

  const metaPath = getMetaPath(rootDir);
  fs.mkdirSync(path.dirname(metaPath), { recursive: true });
  const tmpPath = `${metaPath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmpPath, metaPath);
  return next;
}

module.exports = {
  META_FILENAME,
  getMetaPath,
  readPipelineMeta,
  writePipelineMeta,
};
