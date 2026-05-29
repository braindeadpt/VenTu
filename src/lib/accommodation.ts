/** Nearby accommodation search (Google Maps hotels). */
export function getNearAccommodationUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/hotels/@${lat},${lon},14z`;
}
