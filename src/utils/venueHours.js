// Venue opening-hours per day of week.
// Day index matches JavaScript's getDay(): 0 = Sunday … 6 = Saturday.

export const LOCAL_STORAGE_VENUE_HOURS_KEY = "matchpointVenueHours_v1";

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Default: weekdays 17:00–24:00, weekends 15:00–24:00
export const DEFAULT_VENUE_HOURS = {
  0: { open: 15, close: 24 }, // Sunday
  1: { open: 17, close: 24 }, // Monday
  2: { open: 17, close: 24 }, // Tuesday
  3: { open: 17, close: 24 }, // Wednesday
  4: { open: 17, close: 24 }, // Thursday
  5: { open: 17, close: 24 }, // Friday
  6: { open: 15, close: 24 }, // Saturday
};

export function loadVenueHours() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_VENUE_HOURS_KEY);
    if (!raw) return { ...DEFAULT_VENUE_HOURS };
    const saved = JSON.parse(raw);
    const merged = {};
    for (let i = 0; i < 7; i++) {
      merged[i] = saved[i] ?? DEFAULT_VENUE_HOURS[i];
    }
    return merged;
  } catch {
    return { ...DEFAULT_VENUE_HOURS };
  }
}

export function saveVenueHours(hours) {
  localStorage.setItem(LOCAL_STORAGE_VENUE_HOURS_KEY, JSON.stringify(hours));
}
