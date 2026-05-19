"use client";

import { useState } from "react";
import Link from "next/link";
import { US_STATES } from "@/lib/us-states";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
];

function buildTimeOptions(): string[] {
  const opts: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      opts.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
    }
  }
  return opts;
}

function fmt12h(t: string) {
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${mStr} ${h >= 12 ? "pm" : "am"}`;
}

const TIME_OPTIONS = buildTimeOptions();

export interface ClubPickerOption {
  id: string;
  name: string;
  visibility: "public" | "private";
  /** True when the viewer is a club admin / site admin and the attach
   *  bypasses the approval queue. The form copy changes from
   *  "request approval" to "attach immediately" when this is set. */
  canAttachDirectly: boolean;
}

export function CreateGroupForm({
  createAction,
  preselectedClub,
  clubOptions,
  defaultClubId,
}: {
  createAction: (formData: FormData) => Promise<{ error: string } | void>;
  /** When present, the new group is attached to this club on create.
   *  Comes from `/groups/new?club=<id>` — the page validates the
   *  viewer is a club admin before passing it in. The hidden
   *  `club_id` form field below is what carries it to the server
   *  action; the banner is just visual confirmation for the user.
   *  When this is set we hide the picker (the attach target is
   *  locked). */
  preselectedClub: { id: string; name: string } | null;
  /** Clubs the viewer can pick from (public clubs + private clubs
   *  they're a member of). Empty when nobody has created a club yet. */
  clubOptions: ClubPickerOption[];
  /** Pre-selected option for the picker, used by the
   *  /clubs/new?returnTo=/groups/new round-trip so a just-created
   *  club is selected when the user lands back on this form. */
  defaultClubId: string | null;
}) {
  const [groupType, setGroupType] = useState("ladder_league");
  const [ladderType, setLadderType] = useState("court_promotion");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedClubId, setPickedClubId] = useState<string>(
    preselectedClub?.id ?? defaultClubId ?? ""
  );
  const [requestMessage, setRequestMessage] = useState("");
  const pickedOption = clubOptions.find((c) => c.id === pickedClubId) ?? null;
  const showApprovalCopy = !!pickedOption && !pickedOption.canAttachDirectly;

  // Play Time state
  const [enablePlayTime, setEnablePlayTime] = useState(false);
  const [playDayOfWeek, setPlayDayOfWeek] = useState(6); // Saturday default
  const [playTime, setPlayTime] = useState("09:00");
  const [playTimezone, setPlayTimezone] = useState("America/New_York");
  const [playLocation, setPlayLocation] = useState("");
  const [playPlayerLimit, setPlayPlayerLimit] = useState(16);
  const [playSignupCloses, setPlaySignupCloses] = useState(2);
  const [playWithdrawCloses, setPlayWithdrawCloses] = useState("");
  const [playAllowMembers, setPlayAllowMembers] = useState(false);
  const [playNotes, setPlayNotes] = useState("");
  // Auto-post config
  const [enableAutoPost, setEnableAutoPost] = useState(false);
  const [postDayOfWeek, setPostDayOfWeek] = useState(2); // Tuesday default
  const [postTime, setPostTime] = useState("08:00");

  return (
    <form
      action={async (formData) => {
        setLoading(true);
        setError(null);
        try {
          const result = await createAction(formData);
          if (result?.error) setError(result.error);
        } catch (e) {
          setError("Something went wrong. Please try again.");
          console.error(e);
        } finally {
          setLoading(false);
        }
      }}
      className="card space-y-4"
    >
      {preselectedClub ? (
        <>
          {/* Locked attach: came in via /groups/new?club=<id> which
              the page already verified against club-admin membership.
              The picker is hidden in this mode because the target
              shouldn't change. */}
          <input type="hidden" name="club_id" value={preselectedClub.id} />
          <div className="rounded-lg bg-brand-500/10 ring-1 ring-brand-500/30 px-3 py-2 text-sm text-brand-200">
            Creating this group inside{" "}
            <span className="font-semibold text-brand-100">{preselectedClub.name}</span>.
            Club admins will inherit group admin rights here automatically.
          </div>
        </>
      ) : (
        <div className="space-y-2 border-b border-surface-border pb-4">
          <label
            htmlFor="club_id"
            className="block text-sm font-medium text-dark-200"
          >
            Attach to a club <span className="text-surface-muted font-normal">(optional)</span>
          </label>
          <select
            id="club_id"
            name="club_id"
            value={pickedClubId}
            onChange={(e) => setPickedClubId(e.target.value)}
            className="input w-full"
          >
            <option value="">Standalone — no club</option>
            {clubOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.visibility === "private" ? " (private)" : ""}
                {c.canAttachDirectly ? " — you manage this club" : ""}
              </option>
            ))}
          </select>
          {showApprovalCopy && (
            <>
              <p className="text-xs text-yellow-300">
                You're not an admin of <strong>{pickedOption?.name}</strong>. Your
                group will be created standalone and a request will be sent to
                that club's admins — once they approve, the group will appear
                under the club.
              </p>
              <div>
                <label
                  htmlFor="club_request_message"
                  className="block text-xs font-medium text-dark-200 mb-1"
                >
                  Note for the club admins (optional)
                </label>
                <textarea
                  id="club_request_message"
                  name="club_request_message"
                  rows={2}
                  value={requestMessage}
                  onChange={(e) => setRequestMessage(e.target.value)}
                  placeholder="Anything they should know about your group"
                  maxLength={500}
                  className="input w-full"
                />
              </div>
            </>
          )}
          {pickedOption?.canAttachDirectly && (
            <p className="text-xs text-teal-300">
              You'll be attached to <strong>{pickedOption.name}</strong> immediately
              — no approval needed.
            </p>
          )}
          <p className="text-xs text-surface-muted">
            Don't see your club?{" "}
            <Link
              href="/clubs/new?returnTo=/groups/new"
              className="text-brand-300 hover:text-brand-200 underline-offset-2 hover:underline"
            >
              Create one →
            </Link>
          </p>
        </div>
      )}

      {error && (
        <div className="alert-danger px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-dark-200 mb-1">
          Group Name <span className="text-red-400">*</span>
        </label>
        <input type="text" id="name" name="name" placeholder="e.g. Monday Ladder" required className="input w-full" />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-dark-200 mb-1">
          Description
        </label>
        <textarea id="description" name="description" rows={3} placeholder="Tell people what your group is about..." className="input w-full" />
      </div>

      {/* Location */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="city" className="block text-sm font-medium text-dark-200 mb-1">City</label>
          <input type="text" id="city" name="city" placeholder="e.g. Athens" className="input w-full" />
        </div>
        <div>
          <label htmlFor="state" className="block text-sm font-medium text-dark-200 mb-1">State</label>
          <select id="state" name="state" className="input w-full">
            <option value="">Select State</option>
            {US_STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Group Type */}
      <div>
        <span className="block text-sm font-medium text-dark-200 mb-2">Group Type</span>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-dark-100">
            <input type="radio" name="group_type" value="ladder_league" checked={groupType === "ladder_league"} onChange={() => setGroupType("ladder_league")} className="text-brand-600 focus:ring-brand-500" />
            Ladder League
          </label>
          <label className="flex items-center gap-2 text-sm text-dark-100">
            <input type="radio" name="group_type" value="free_play" checked={groupType === "free_play"} onChange={() => setGroupType("free_play")} className="text-brand-600 focus:ring-brand-500" />
            Free Play
          </label>
        </div>
        <p className="mt-1 text-xs text-surface-muted">Ladder League uses step-based rankings. Free Play tracks wins and losses.</p>
      </div>

      {/* Visibility */}
      <div>
        <span className="block text-sm font-medium text-dark-200 mb-2">Visibility</span>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-dark-100">
            <input type="radio" name="visibility" value="public" defaultChecked className="text-brand-600 focus:ring-brand-500" />
            Public
          </label>
          <label className="flex items-center gap-2 text-sm text-dark-100">
            <input type="radio" name="visibility" value="private" className="text-brand-600 focus:ring-brand-500" />
            Private
          </label>
        </div>
        <p className="mt-1 text-xs text-surface-muted">Public groups can be found and joined by anyone. Private groups require an invite.</p>
      </div>

      {/* Ladder League Settings */}
      {groupType === "ladder_league" && (
        <div className="space-y-6 border-t border-surface-border pt-4">
          <h2 className="text-sm font-semibold text-dark-100">Ladder Settings</h2>

          {/* Court Movement */}
          <div>
            <span className="block text-sm font-medium text-dark-200 mb-2">Court Movement</span>
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="radio" name="ladder_type" value="court_promotion" checked={ladderType === "court_promotion"} onChange={() => setLadderType("court_promotion")} className="mt-0.5 text-brand-600 focus:ring-brand-500" />
                <span className="text-sm">
                  <span className="font-medium text-dark-100">Court Promotion</span>
                  <span className="text-surface-muted"> — 1st place moves up a court, last place moves down. Court assignments carry forward between sessions.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="radio" name="ladder_type" value="dynamic_ranking" checked={ladderType === "dynamic_ranking"} onChange={() => setLadderType("dynamic_ranking")} className="mt-0.5 text-brand-600 focus:ring-brand-500" />
                <span className="text-sm">
                  <span className="font-medium text-dark-100">Dynamic Ranking</span>
                  <span className="text-surface-muted"> — After each session, steps and win % are recalculated. The next session re-seeds everyone from updated rankings.</span>
                </span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pct_window_sessions" className="block text-sm font-medium text-dark-200 mb-1">Pt % Window (sessions)</label>
              <input type="number" id="pct_window_sessions" name="pct_window_sessions" defaultValue={10} min={1} className="input w-full" />
              <p className="mt-1 text-xs text-surface-muted">Recent sessions used to calculate point percentage.</p>
            </div>
            <div>
              <label htmlFor="new_player_start_step" className="block text-sm font-medium text-dark-200 mb-1">New Player Start Step</label>
              <input type="number" id="new_player_start_step" name="new_player_start_step" defaultValue={5} min={1} className="input w-full" />
              <p className="mt-1 text-xs text-surface-muted">Step assigned to players when they first join.</p>
            </div>
            <div>
              <label htmlFor="min_step" className="block text-sm font-medium text-dark-200 mb-1">Highest Step</label>
              <input type="number" id="min_step" name="min_step" defaultValue={1} min={1} className="input w-full" />
              <p className="mt-1 text-xs text-surface-muted">The best position on the ladder (1 = top).</p>
            </div>
            <div>
              <label htmlFor="max_step" className="block text-sm font-medium text-dark-200 mb-1">Lowest Step</label>
              <input type="number" id="max_step" name="max_step" defaultValue={10} min={1} className="input w-full" />
              <p className="mt-1 text-xs text-surface-muted">The lowest step a player can drop to.</p>
            </div>
            <div>
              <label htmlFor="step_move_up" className="block text-sm font-medium text-dark-200 mb-1">Step Move Up</label>
              <input type="number" id="step_move_up" name="step_move_up" defaultValue={1} min={1} className="input w-full" />
              <p className="mt-1 text-xs text-surface-muted">Steps gained by finishing 1st in a pool.</p>
            </div>
            <div>
              <label htmlFor="step_move_down" className="block text-sm font-medium text-dark-200 mb-1">Step Move Down</label>
              <input type="number" id="step_move_down" name="step_move_down" defaultValue={1} min={1} className="input w-full" />
              <p className="mt-1 text-xs text-surface-muted">Steps lost by finishing last in a pool.</p>
            </div>
            <div>
              <label htmlFor="game_limit_4p" className="block text-sm font-medium text-dark-200 mb-1">Four Player Score Limit</label>
              <input type="number" id="game_limit_4p" name="game_limit_4p" min={1} className="input w-full" />
              <p className="mt-1 text-xs text-surface-muted">Score limit in a 4-player pool.</p>
            </div>
            <div>
              <label htmlFor="game_limit_5p" className="block text-sm font-medium text-dark-200 mb-1">Five Player Score Limit</label>
              <input type="number" id="game_limit_5p" name="game_limit_5p" min={1} className="input w-full" />
              <p className="mt-1 text-xs text-surface-muted">Score limit in a 5-player pool.</p>
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <input type="checkbox" name="win_by_2" id="win_by_2" defaultChecked className="h-4 w-4 rounded border-surface-border text-brand-600 focus:ring-brand-500" />
              <label htmlFor="win_by_2" className="text-sm font-medium text-dark-200">Win by 2 required</label>
            </div>
          </div>

          {/* ── Play Time ─────────────────────────────────── */}
          <div className="border-t border-surface-border pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-dark-100">Play Time</h3>
                <p className="text-xs text-surface-muted mt-0.5">
                  The recurring time your group meets to play. Shown on the group card and used for auto-posting sign-up sheets.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-dark-100 cursor-pointer">
                <input
                  type="checkbox"
                  name="enable_play_time"
                  checked={enablePlayTime}
                  onChange={(e) => {
                    setEnablePlayTime(e.target.checked);
                    if (!e.target.checked) setEnableAutoPost(false);
                  }}
                  className="h-4 w-4 rounded border-surface-border text-brand-600 focus:ring-brand-500"
                />
                Set up now
              </label>
            </div>

            {enablePlayTime && (
              <div className="space-y-4 rounded-lg border border-surface-border bg-surface-overlay/30 p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-1">Day of Week</label>
                    <select
                      name="play_day_of_week"
                      value={playDayOfWeek}
                      onChange={(e) => setPlayDayOfWeek(Number(e.target.value))}
                      className="input w-full"
                      required
                    >
                      {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-1">Start Time</label>
                    <select
                      name="play_time"
                      value={playTime}
                      onChange={(e) => setPlayTime(e.target.value)}
                      className="input w-full"
                      required
                    >
                      {TIME_OPTIONS.map((t) => <option key={t} value={t}>{fmt12h(t)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-1">Timezone</label>
                    <select
                      name="play_timezone"
                      value={playTimezone}
                      onChange={(e) => setPlayTimezone(e.target.value)}
                      className="input w-full"
                      required
                    >
                      {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-1">Max Players</label>
                    <input
                      type="number"
                      name="play_player_limit"
                      value={playPlayerLimit}
                      onChange={(e) => setPlayPlayerLimit(Number(e.target.value))}
                      min={4}
                      className="input w-full"
                      required
                    />
                    <p className="mt-1 text-xs text-surface-muted">Players beyond this go to the waitlist.</p>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-dark-200 mb-1">Location</label>
                    <input
                      type="text"
                      name="play_location"
                      value={playLocation}
                      onChange={(e) => setPlayLocation(e.target.value)}
                      placeholder="e.g. Athens Community Center — Courts 1–4"
                      className="input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-1">Sign-Up Closes</label>
                    <select
                      name="play_signup_closes_hours"
                      value={playSignupCloses}
                      onChange={(e) => setPlaySignupCloses(Number(e.target.value))}
                      className="input w-full"
                      required
                    >
                      {[1, 2, 3, 6, 12, 24].map((h) => (
                        <option key={h} value={h}>{h} hour{h !== 1 ? "s" : ""} before</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-1">Withdrawal Cutoff</label>
                    <select
                      name="play_withdraw_closes_hours"
                      value={playWithdrawCloses}
                      onChange={(e) => setPlayWithdrawCloses(e.target.value)}
                      className="input w-full"
                    >
                      <option value="">No cutoff</option>
                      {[1, 2, 3, 6, 12, 24].map((h) => (
                        <option key={h} value={String(h)}>{h} hour{h !== 1 ? "s" : ""} before</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-1">Notes (optional)</label>
                  <textarea
                    name="play_notes"
                    value={playNotes}
                    onChange={(e) => setPlayNotes(e.target.value)}
                    rows={2}
                    placeholder="Any recurring notes for players..."
                    className="input w-full"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="play_allow_members"
                    name="play_allow_members"
                    checked={playAllowMembers}
                    onChange={(e) => setPlayAllowMembers(e.target.checked)}
                    className="h-4 w-4 rounded border-surface-border text-brand-600 focus:ring-brand-500"
                  />
                  <label htmlFor="play_allow_members" className="text-sm text-dark-200">
                    Allow members to add other group members to the sign-up list
                  </label>
                </div>

                {/* Auto-Posting */}
                <div className="border-t border-surface-border pt-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="enable_auto_post"
                      name="enable_auto_post"
                      checked={enableAutoPost}
                      onChange={(e) => setEnableAutoPost(e.target.checked)}
                      className="h-4 w-4 rounded border-surface-border text-brand-600 focus:ring-brand-500"
                    />
                    <label htmlFor="enable_auto_post" className="text-sm font-medium text-dark-200">
                      Auto-post sign-up sheets
                    </label>
                  </div>
                  {enableAutoPost && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pl-7">
                      <p className="sm:col-span-2 text-xs text-surface-muted -mt-1">
                        Choose which day and time the sign-up sheet is automatically posted. All group members are notified immediately.
                      </p>
                      <div>
                        <label className="block text-sm font-medium text-dark-200 mb-1">Post On</label>
                        <select
                          name="post_day_of_week"
                          value={postDayOfWeek}
                          onChange={(e) => setPostDayOfWeek(Number(e.target.value))}
                          className="input w-full"
                          required={enableAutoPost}
                        >
                          {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-dark-200 mb-1">Post At</label>
                        <select
                          name="post_time"
                          value={postTime}
                          onChange={(e) => setPostTime(e.target.value)}
                          className="input w-full"
                          required={enableAutoPost}
                        >
                          {TIME_OPTIONS.map((t) => <option key={t} value={t}>{fmt12h(t)}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Link href="/groups" className="btn-secondary">Cancel</Link>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Creating..." : "Create Group"}
        </button>
      </div>
    </form>
  );
}
