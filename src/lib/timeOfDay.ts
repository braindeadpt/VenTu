export type Daypart = 'dawn' | 'day' | 'sunset' | 'night';

/** Europe/Lisbon — default for VenTu (PT spots). */
export const VENTU_TIMEZONE = 'Europe/Lisbon';

interface DaypartBounds {
  dawn: [number, number];
  day: [number, number];
  sunset: [number, number];
  night: [number, number];
}

/** Local hour ranges [start, end) in 24h format. */
const BOUNDS: DaypartBounds = {
  dawn: [5, 8],
  day: [8, 18],
  sunset: [18, 21],
  night: [21, 24],
};

function getLocalHour(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === 'hour');
  return hourPart ? parseInt(hourPart.value, 10) : date.getHours();
}

/**
 * Time-of-day bucket for ambient UI (sunset header, etc.).
 * Sunset window: 18:00–21:00 local (PT by default).
 */
export function getDaypart(
  date: Date = new Date(),
  timeZone: string = VENTU_TIMEZONE,
): Daypart {
  const h = getLocalHour(date, timeZone);

  if (h >= BOUNDS.night[0] || h < BOUNDS.dawn[0]) return 'night';
  if (h >= BOUNDS.dawn[0] && h < BOUNDS.dawn[1]) return 'dawn';
  if (h >= BOUNDS.sunset[0] && h < BOUNDS.sunset[1]) return 'sunset';
  return 'day';
}

export function isSunsetDaypart(daypart: Daypart): boolean {
  return daypart === 'sunset';
}
