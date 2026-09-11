---
name: ventu-i18n-voice
description: PT-PT voice and i18n rules for VenTu copy. Use whenever writing or editing user-facing strings, translations, news, or Dawn Patrol content.
---

# VenTu i18n & Voice

- PT-PT first, EN second. Never Brazilian Portuguese (tu forms, "maré",
  "ondulação", "offshore" — not "você", "maré cheia" calques, etc.).
- Every user-facing string goes through the i18n keys — add the key in both
  `pt` and `en` in the same change. No hardcoded copy, no raw keys leaking.
- Times are local to the spot and obvious — never raw UTC in the UI.
- Dawn Patrol is editorial: short, local, human, Portugal-specific. No LLM
  adjectives ("unleash", "seamless", "game-changing", "elevate").
- Scores explain themselves in the user's language: "ÉPICO — offshore fraco,
  período 12s, NW".

See `src/lib/voice.ts` for the canonical product vocabulary.
