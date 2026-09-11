<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# VenTu agent contract

Skills live in `.agents/skills/` (Agent Skills standard). Same files for Claude, Cursor, Devin, Grok, Copilot.
Tool-specific dirs (`.claude/skills`, `.cursor/skills`, `.devin/skills`, `.grok/skills`, `.github/skills`) are local junctions to `.agents/skills` — recreate on a fresh clone with `New-Item -ItemType Junction -Path <dir> -Target .agents\skills` (Windows) or `ln -sfn ../.agents/skills <dir>`.

When touching UI, CSS, Tailwind, components, map, or copy:
1. Load `ventu-premium-frontend` first. It overrides third-party aesthetic defaults.
2. Then `frontend-design`, `web-design-guidelines`, `apple-design`, `animate`.
3. Follow `docs/DESIGN-SYSTEM.md`. Do not add fonts or UI kits.
4. PT-PT first. Static export must keep working.
5. Before a frontend PR, load `ventu-verify-ui`.

Mention skills as `@skills:ventu-premium-frontend` when the tool supports it.
