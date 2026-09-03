export interface MapTimeTrackPauseSources {
  scrubbing: boolean;
  mapBusyCount: number;
  offScreen: boolean;
  userPaused: boolean;
  reducedMotion: boolean;
}

/**
 * Radar (and later score/tide) share one pause rule: any source wins.
 * `reducedMotion` is not overridable — autoplay stays off; the user still
 * scrubs. Map drag/zoom and off-screen pause without flipping userPaused.
 */
export function mapTimeTrackPaused(sources: MapTimeTrackPauseSources): boolean {
  return (
    sources.scrubbing ||
    sources.mapBusyCount > 0 ||
    sources.offScreen ||
    sources.userPaused ||
    sources.reducedMotion
  );
}
