'use client';

import { useEffect, useState } from 'react';
import { getAssetPath } from '@/lib/paths';
import type { IpmaWarningsData } from '@/lib/ipmaWarnings';

/**
 * Module-level cache so every surface on a page (map markers, home cards,
 * spot warnings section) shares ONE fetch of warnings.json. `undefined`
 * means "not resolved yet"; null = fetch failed (never retried this load).
 */
let warningsCache: IpmaWarningsData | null | undefined;

/**
 * Fetch the baked IPMA warnings (public/data/warnings.json) once per page.
 * Optional layer — never throws: on failure it resolves to null and the
 * callers simply skip the badges.
 */
export function useIpmaWarnings(): IpmaWarningsData | null {
  const [data, setData] = useState<IpmaWarningsData | null>(() =>
    warningsCache === undefined ? null : warningsCache,
  );

  useEffect(() => {
    if (warningsCache !== undefined) {
      setData(warningsCache);
      return;
    }
    let active = true;
    fetch(getAssetPath('/data/warnings.json'))
      .then((r) => {
        if (!r.ok) throw new Error('warnings fetch failed');
        return r.json();
      })
      .then((d) => {
        warningsCache = d as IpmaWarningsData;
        if (active) setData(warningsCache);
      })
      .catch(() => {
        warningsCache = null;
        if (active) setData(null);
      });
    return () => {
      active = false;
    };
  }, []);

  return data;
}
