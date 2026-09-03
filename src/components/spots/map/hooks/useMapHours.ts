'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchMapHours,
  indexForHourOfDay,
  type MapHoursFile,
} from '@/lib/mapHours';
import {
  readMapHoursEnabledPref,
  readMapHoursPref,
  resetMapHoursPref,
  writeMapHoursEnabledPref,
  writeMapHoursPref,
} from '@/lib/mapHoursPrefs';

interface UseMapHoursOptions {
  /** Hours mode is fullscreen-only — compact/hero maps stay on live scores. */
  isFullscreen: boolean;
  /** Deep link `?hours=1` (or `?t=`) — does not persist. */
  initialEnabled: boolean;
  /** Deep link `?t=18` — Lisbon hour of day, nearest 3 h step. */
  initialHourOfDay: number | null;
}

/**
 * 48 h score timeline for the fullscreen map. Same persist shape as radar
 * (`enabled` / `paused` / `frame`). Deep links do not write the pref.
 * `map-hours.json` is fetched only when the layer is on (toggle, persist,
 * or `?hours=1` / `?t=`), so the first map paint is not blocked by it.
 */
export function useMapHours({
  isFullscreen,
  initialEnabled,
  initialHourOfDay,
}: UseMapHoursOptions) {
  const [file, setFile] = useState<MapHoursFile | null | undefined>(undefined);
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (initialEnabled) return true;
    if (typeof window === 'undefined') return false;
    return readMapHoursEnabledPref() === true;
  });
  const [frame, setFrame] = useState(0);
  const [userPaused, setUserPaused] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return readMapHoursPref().paused;
  });
  const [prefSet, setPrefSet] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return readMapHoursEnabledPref() !== undefined;
  });
  const frameRef = useRef(0);
  const userPausedRef = useRef(userPaused);
  const restoredRef = useRef(false);

  useEffect(() => {
    userPausedRef.current = userPaused;
  }, [userPaused]);

  useEffect(() => {
    if (initialEnabled) setEnabled(true);
  }, [initialEnabled]);

  useEffect(() => {
    if (!isFullscreen || file !== undefined || !enabled) return;
    let cancelled = false;
    fetchMapHours().then((data) => {
      if (!cancelled) setFile(data);
    });
    return () => {
      cancelled = true;
    };
  }, [isFullscreen, file, enabled]);

  useEffect(() => {
    if (!file || restoredRef.current) return;
    restoredRef.current = true;
    const max = Math.max(0, file.times.length - 1);
    if (initialHourOfDay != null) {
      const idx = indexForHourOfDay(file.times, initialHourOfDay);
      frameRef.current = idx;
      setFrame(idx);
      return;
    }
    const saved = Math.max(0, Math.min(max, readMapHoursPref().frame));
    frameRef.current = saved;
    setFrame(saved);
  }, [file, initialHourOfDay]);

  const toggleHours = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      writeMapHoursEnabledPref(next);
      setPrefSet(true);
      return next;
    });
  }, []);

  const handleHoursFrameChange = useCallback(
    (value: number) => {
      if (!file) return;
      const v = Math.max(0, Math.min(file.times.length - 1, value));
      frameRef.current = v;
      setFrame(v);
      if (userPausedRef.current) writeMapHoursPref(true, v);
    },
    [file],
  );

  const handleHoursUserPausedChange = useCallback((paused: boolean) => {
    userPausedRef.current = paused;
    setUserPaused(paused);
    writeMapHoursPref(paused, frameRef.current);
  }, []);

  const handleResetHours = useCallback(() => {
    resetMapHoursPref();
    userPausedRef.current = false;
    frameRef.current = 0;
    restoredRef.current = false;
    setUserPaused(false);
    setFrame(0);
    setEnabled(false);
    setPrefSet(false);
  }, []);

  const hoursOn = isFullscreen && enabled;
  const hoursLive = hoursOn && !!file && file.times.length > 1;

  return {
    hoursFile: file ?? null,
    hoursOn,
    hoursLive,
    hoursFrame: frame,
    hoursUserPaused: userPaused,
    hoursPrefSet: prefSet,
    hoursUnavailable: file === null,
    hoursTimes: file?.times ?? [],
    toggleHours,
    handleHoursFrameChange,
    handleHoursUserPausedChange,
    handleResetHours,
  };
}
