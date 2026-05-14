import { DEFAULT_TZ } from "@/lib/utils";

/**
 * Sign-up sheet lifecycle rules — one source of truth, used by every
 * surface (list page, detail page, dashboard, group page, signup / withdraw
 * APIs) so the server and UI can't drift apart.
 *
 * Two rules live here:
 *
 *  1. **Signup & withdraw close at event start.** Whatever `signup_closes_at`
 *     or `withdraw_closes_at` admins set, they're capped at `event_time`.
 *     No one should be able to join or leave a sheet after play has started.
 *
 *  2. **Sheets are hidden 3 hours after event start.** The event is over;
 *     players don't need to see it, and admins still get a short grace
 *     window to review the roster before it drops off the list / detail /
 *     dashboard surfaces. Admin access can bypass this by opting in —
 *     see `sheetIsVisibleToPlayer`. The `/admin/sheets` management
 *     page never applies this filter, so admins can still pull up
 *     old rosters there indefinitely.
 */

/** Window in milliseconds after event start during which a Ladder
 *  sheet remains visible to players. After this, the list / detail /
 *  dashboard drop it. Ladder needs a longer tail so admins can score
 *  + close the session before the sheet vanishes from players. */
export const SHEET_VISIBLE_WINDOW_MS = 3 * 60 * 60 * 1000;

/** Skills sessions have no follow-up session to score — once the event
 *  start has passed by 30 minutes, the sheet's purpose is done and it
 *  hides (and signup/withdraw close) at the same instant. */
export const SKILLS_SHEET_VISIBLE_WINDOW_MS = 30 * 60 * 1000;

type SheetLifecycleShape = {
  event_time?: string | null;
  event_date?: string | null;
  signup_closes_at?: string | null;
  withdraw_closes_at?: string | null;
  timezone?: string | null;
  play_type?: string | null;
};

/** Ms past event start at which the sheet's signup/withdraw window
 *  closes and player surfaces drop it. Ladder: at start. Skills:
 *  start + 30 minutes. */
function lifecycleCutoffMs(sheet: SheetLifecycleShape): number {
  return sheet.play_type === "skills" ? SKILLS_SHEET_VISIBLE_WINDOW_MS : 0;
}

type SheetStatusShape = SheetLifecycleShape & {
  status?: string | null;
};

/** Best-effort event-start Date for a sheet. Prefers the precise `event_time`
 *  timestamp; falls back to midnight of `event_date` *in the sheet's zone*
 *  when the former isn't set (older rows). Returns null if neither is
 *  available.
 *
 *  The fallback uses the sheet's `timezone` (defaulting to ET) instead of
 *  the server's local zone. Without this, a UTC-deployed runtime would
 *  treat "midnight April 22" as 00:00 UTC, and signup/withdraw/expire
 *  windows would drift by the sheet's UTC offset (4-5h for ET sheets). */
export function sheetEventStart(sheet: SheetLifecycleShape): Date | null {
  if (sheet.event_time) return new Date(sheet.event_time);
  if (sheet.event_date) {
    const tz = sheet.timezone ?? DEFAULT_TZ;
    return wallClockInZoneToUtcLocal(`${sheet.event_date}T00:00:00`, tz);
  }
  return null;
}

/**
 * Inlined wall-clock → UTC. Duplicated from `lib/timezone.ts` rather than
 * imported because this module is consumed by client bundles, edge crons,
 * and node tooling alike — keeping it dependency-light makes it cheap to
 * use anywhere.
 */
function wallClockInZoneToUtcLocal(localWallClock: string, timeZone: string): Date {
  const candidate = new Date(`${localWallClock}Z`);
  const parts = (tz: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(candidate);
  const toMs = (p: Intl.DateTimeFormatPart[]) => {
    const get = (t: string) => parseInt(p.find((x) => x.type === t)?.value ?? "0", 10);
    const h = get("hour") === 24 ? 0 : get("hour");
    return Date.UTC(get("year"), get("month") - 1, get("day"), h, get("minute"), get("second"));
  };
  const offset = toMs(parts(timeZone)) - toMs(parts("UTC"));
  return new Date(candidate.getTime() - offset);
}

/** Has signup closed for this sheet? True when either the admin's
 *  `signup_closes_at` has passed or the sheet's lifecycle cutoff
 *  (event start for ladder, event start + 30min for skills) has
 *  passed — whichever comes first. */
export function sheetSignupClosed(
  sheet: SheetLifecycleShape,
  now: Date = new Date()
): boolean {
  if (sheet.signup_closes_at && new Date(sheet.signup_closes_at) <= now) return true;
  const start = sheetEventStart(sheet);
  if (start && start.getTime() + lifecycleCutoffMs(sheet) <= now.getTime()) return true;
  return false;
}

/** Has the withdraw window closed for this sheet? Same shape as signup. */
export function sheetWithdrawClosed(
  sheet: SheetLifecycleShape,
  now: Date = new Date()
): boolean {
  if (sheet.withdraw_closes_at && new Date(sheet.withdraw_closes_at) <= now) return true;
  const start = sheetEventStart(sheet);
  if (start && start.getTime() + lifecycleCutoffMs(sheet) <= now.getTime()) return true;
  return false;
}

/** True once we've passed the visibility window after event start.
 *  3 hours for ladder, 30 minutes for skills. Surfaces that render
 *  to regular players should treat this as "gone". */
export function sheetIsExpired(
  sheet: SheetLifecycleShape,
  now: Date = new Date()
): boolean {
  const start = sheetEventStart(sheet);
  if (!start) return false;
  const window = sheet.play_type === "skills"
    ? SKILLS_SHEET_VISIBLE_WINDOW_MS
    : SHEET_VISIBLE_WINDOW_MS;
  return now.getTime() > start.getTime() + window;
}

/** Whether a regular (non-admin) player should see this sheet at all. */
export function sheetIsVisibleToPlayer(
  sheet: SheetLifecycleShape,
  now: Date = new Date()
): boolean {
  return !sheetIsExpired(sheet, now);
}

/** Display status for a sheet — the value every UI surface should render.
 *  The raw `signup_sheets.status` column only changes when an admin clicks
 *  Close or Cancel; nothing in the system flips it at event time. So an
 *  "open" sheet whose signup window has passed still says "open" in the
 *  DB. This helper downgrades that to "closed" so badges and pills
 *  reflect reality. Cancelled is always cancelled. */
export function sheetEffectiveStatus(
  sheet: SheetStatusShape,
  now: Date = new Date()
): string {
  const raw = sheet.status ?? "open";
  if (raw !== "open") return raw;
  return sheetSignupClosed(sheet, now) ? "closed" : "open";
}
