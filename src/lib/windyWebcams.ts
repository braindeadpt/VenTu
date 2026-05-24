import windyData from '@/data/windy-webcams.json';

export type WindyWebcamEntry = {
  playerUrl: string;
  name: string;
};

const spots = windyData.spots as Record<string, WindyWebcamEntry>;

export function getWindyWebcam(slug: string): WindyWebcamEntry | null {
  return spots[slug] ?? null;
}

export function hasWindyWebcam(slug: string): boolean {
  return slug in spots;
}

export function windyWebcamCount(): number {
  return Object.keys(spots).length;
}
