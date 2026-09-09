'use client';

import { useEffect } from 'react';

/**
 * Root hydration beacon for end-to-end tests.
 *
 * Sets `data-hydrated="true"` on <html> after this layout-level client
 * component commits — i.e. React hydration of the shell (header, drawer,
 * theme toggle) has run. Pre-hydration taps on the burger do nothing (the
 * onClick isn't attached yet), which is the CI-only mobile-playtest flake:
 * local runs hydrate before the first tap, a loaded 2-core runner does not.
 *
 * Tests wait for `html[data-hydrated="true"]` instead of sleeping on
 * domcontentloaded. Zero visual/behavioural impact on production users.
 */
export default function HydrationBeacon() {
  useEffect(() => {
    document.documentElement.setAttribute('data-hydrated', 'true');
  }, []);
  return null;
}
