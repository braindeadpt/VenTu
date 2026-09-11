/**
 * Agent-skills bridges — creates local links so tool-specific dirs expose the
 * canonical `.agents/skills/` (Claude, Cursor, Devin, Grok, Copilot all read
 * the same files; no copies, no drift).
 *
 * Runs from `npm install` (postinstall). Idempotent: existing paths are left
 * alone. Windows uses junctions (no admin needed); POSIX uses dir symlinks.
 * Failures are warnings, never install-breaking.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const target = path.join(root, '.agents', 'skills');
const links = [
  '.claude/skills',
  '.cursor/skills',
  '.devin/skills',
  '.grok/skills',
  '.github/skills',
];

for (const rel of links) {
  const link = path.join(root, rel);
  try {
    if (fs.existsSync(link)) continue; // junction, symlink or real dir — keep
    fs.mkdirSync(path.dirname(link), { recursive: true });
    const to = process.platform === 'win32' ? target : path.relative(path.dirname(link), target);
    fs.symlinkSync(to, link, process.platform === 'win32' ? 'junction' : 'dir');
    console.log(`[agent-links] ${rel} -> .agents/skills`);
  } catch (e) {
    console.warn(`[agent-links] skipped ${rel}: ${e.message}`);
  }
}
