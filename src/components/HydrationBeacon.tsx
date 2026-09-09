'use client';

import { useEffect } from 'react';

/**
 * Root hydration beacon for end-to-end tests and CSS gating.
 *
 * Sets `data-hydrated="true"` (attribute, for test selectors) and the
 * `is-hydrated` class (for CSS) on <html> after this layout-level client
 * component commits — i.e. React hydration of the shell (header, drawer,
 * theme toggle) has run. Pre-hydration taps on the burger do nothing (the
 * onClick isn't attached yet), which is the CI-only mobile-playtest flake:
 * local runs hydrate before the first tap, a loaded 2-core runner does not.
 *
 * Tests wait for `html[data-hydrated="true"]` instead of sleeping on
 * domcontentloaded. CSS uses the same instant via `.is-hydrated` to reveal
 * mounted-gated UI (favorite/check-in hearts, dawn-patrol slots) only once
 * their interactive state exists — the no-placeholder-flash pattern shared
 * with the theme toggle's class-driven icons. Zero visual/behavioural
 * impact beyond removing those flashes.
 */
export default function HydrationBeacon() {
  useEffect(() => {
    document.documentElement.setAttribute('data-hydrated', 'true');
    document.documentElement.classList.add('is-hydrated');
  }, []);
  return null;
}
