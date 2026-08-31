/**
 * Fetch the latest IPMA radar frames → public/data/radar/frames/*.png
 * + public/data/radar.json (carousel manifest: bounds, attribution, frame list).
 *
 * The IPMA radar has no WMTS/tile service; the stable machine-readable source
 * is the manifest at resources.www/transf/radar/imgs-radar.json (5-min PNG
 * frames, transparent alpha overlay). We bake the newest N frames so the
 * client can animate the last hour of precipitation as a carousel, served
 * from our own origin.
 *
 * IPMA outages must NOT brick the pipeline: on failure we keep the previous
 * radar files (if any) and exit 0, like the other optional layers.
 */

const fs = require('fs');
const path = require('path');
const {
  FRAME_BASE_URL,
  fetchRadarManifest,
  pickFrames,
  buildRadarPayload,
} = require('./lib/ipmaRadar.js');

const DATA_DIR = path.join(__dirname, '../public/data');
const IMAGE_PATH = path.join(DATA_DIR, 'radar/ipma-radar.png');
const FRAMES_DIR = path.join(DATA_DIR, 'radar/frames');
const META_PATH = path.join(DATA_DIR, 'radar.json');

/** Carousel size — the last hour at the 5-min IPMA cadence. */
const FRAME_COUNT = 12;

async function run() {
  console.log('🌧️  IPMA radar — fetching latest frames...');
  const frames = await fetchRadarManifest();
  const picked = pickFrames(frames, FRAME_COUNT);
  if (!picked.length) {
    throw new Error('manifest vazio — sem frames de radar disponíveis');
  }

  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  const saved = [];
  for (const frame of picked) {
    const url = FRAME_BASE_URL + frame.path;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'VenTu-Bot/1.0 (+https://ventu.surf)' },
    });
    if (!res.ok) throw new Error(`IPMA radar frame HTTP ${res.status} para ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(path.join(FRAMES_DIR, frame.path), buf);
    saved.push(frame.path);
  }

  // Prune stale frames no longer in the carousel set.
  for (const file of fs.readdirSync(FRAMES_DIR)) {
    if (file.endsWith('.png') && !saved.includes(file)) {
      fs.unlinkSync(path.join(FRAMES_DIR, file));
    }
  }

  // Keep ipma-radar.png = newest frame (backward compat with the old single-frame layout).
  fs.copyFileSync(path.join(FRAMES_DIR, picked[0].path), IMAGE_PATH);

  const payload = buildRadarPayload(picked);
  fs.writeFileSync(META_PATH, JSON.stringify(payload, null, 2));

  const totalKb = saved.reduce((acc, f) => acc + fs.statSync(path.join(FRAMES_DIR, f)).size, 0) / 1024;
  console.log(`✅ Radar saved: ${saved.length} frames (${totalKb.toFixed(0)} KB total)`);
  console.log(`📡 Newest ${payload.frameTime} · oldest ${payload.frames[payload.frames.length - 1].frameTime} · bounds SW(${payload.bounds.south}, ${payload.bounds.west}) NE(${payload.bounds.north}, ${payload.bounds.east})`);
  return payload;
}

async function main() {
  try {
    await run();
  } catch (err) {
    console.error('❌ IPMA radar fetch failed:', err.message || err);
    if (fs.existsSync(IMAGE_PATH)) {
      console.warn('⚠️ Keeping previous radar frames — pipeline continues.');
    } else {
      console.warn('⚠️ No previous radar frame — radar layer stays off.');
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { run, main, IMAGE_PATH, FRAMES_DIR, META_PATH, FRAME_COUNT };
