/**
 * IANA-zone-aware datetime helpers.
 *
 * Every event in the system (sheets, tournaments, recurring schedules)
 * carries its own `timezone` IANA identifier. Forms collect wall-clock
 * time-of-day in *that* zone — never the organizer's browser zone —
 * because an admin traveling outside the event's region shouldn't
 * silently shift the event by their UTC offset.
 *
 * The conversion uses Intl.DateTimeFormat to ask "what does this UTC
 * instant look like in the target zone?" and back-solves for the
 * offset. That keeps DST transitions correct without bringing a date
 * library on board.
 */

/**
 * Convert a wall-clock datetime ("YYYY-MM-DDTHH:MM[:SS]") in the given
 * IANA zone to a UTC instant. Output is a Date.
 *
 * Example: ("2026-05-13T08:00", "America/New_York") on May 13 (EDT)
 * → Date representing 12:00 UTC.
 */
export function wallClockInZoneToUtc(localWallClock: string, timeZone: string): Date {
  // Normalize: accept "YYYY-MM-DDTHH:MM" or with seconds; strip any
  // trailing zone marker the caller may have included.
  const trimmed = localWallClock.replace(/[Z+-]\d{2}:?\d{2}$|Z$/, "");
  const padded = /T\d{2}:\d{2}$/.test(trimmed) ? `${trimmed}:00` : trimmed;
  // Initial guess: pretend the wall-clock is already UTC. Then ask
  // Intl what that instant looks like in the target zone and adjust
  // by the difference.
  const candidate = new Date(`${padded}Z`);
  const offsetMs = getZoneOffsetMs(candidate, timeZone);
  return new Date(candidate.getTime() - offsetMs);
}

/** Same as `wallClockInZoneToUtc` but returns an ISO string, or `null`
 *  for empty input. Empty/invalid input does not throw. */
export function wallClockInZoneToIso(
  localWallClock: string | null | undefined,
  timeZone: string
): string | null {
  if (!localWallClock) return null;
  const d = wallClockInZoneToUtc(localWallClock, timeZone);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Project a UTC instant onto a wall-clock string ("YYYY-MM-DDTHH:MM")
 * in the given IANA zone. The output is what a `<input type="datetime-local">`
 * expects, with the wall-clock pinned to the event's zone rather than
 * the user's browser.
 */
export function isoToWallClockInZone(
  iso: string | null | undefined,
  timeZone: string
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  // Intl uses "24" for midnight in some locale data; normalize to "00".
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/** Project a UTC instant onto a wall-clock "HH:MM" in the given zone. */
export function isoToTimeInZone(
  iso: string | null | undefined,
  timeZone: string
): string {
  const full = isoToWallClockInZone(iso, timeZone);
  return full ? full.slice(11) : "";
}

/** Project a UTC instant onto a calendar "YYYY-MM-DD" in the given zone. */
export function isoToDateInZone(
  iso: string | null | undefined,
  timeZone: string
): string {
  const full = isoToWallClockInZone(iso, timeZone);
  return full ? full.slice(0, 10) : "";
}

/**
 * UTC-offset of the given instant under the given zone, in ms.
 * Positive east of UTC. Used internally by `wallClockInZoneToUtc`.
 */
function getZoneOffsetMs(utcInstant: Date, timeZone: string): number {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(utcInstant);
  const toMs = (parts: Intl.DateTimeFormatPart[]) => {
    const get = (t: string) =>
      parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
    // Normalize Intl's "24" → "00" for midnight.
    const h = get("hour") === 24 ? 0 : get("hour");
    return Date.UTC(get("year"), get("month") - 1, get("day"), h, get("minute"), get("second"));
  };
  return toMs(fmt(timeZone)) - toMs(fmt("UTC"));
}
