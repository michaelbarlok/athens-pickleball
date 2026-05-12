import { createServiceClient } from "@/lib/supabase/server";
import {
  findIncompleteCourts,
  lastScoreTimestamp,
  finalizeSession,
  sendSessionRecap,
} from "@/lib/session-end-helpers";
import { notify } from "@/lib/notify";

/**
 * Auto-complete idle ladder sessions.
 *
 * Real-world scenario: admin finishes their matches, drives home,
 * forgets to click End Session. Today the session stays in
 * round_active or round_complete forever (or until a human notices)
 * which blocks the next sheet's auto-start, freezes step movement,
 * and leaves push notifications for the recap unsent.
 *
 * Rule: a ladder session is auto-finalized when ALL of the following
 * are true:
 *   - status is "round_active" or "round_complete"
 *   - every court has its expected game count submitted for the
 *     current round (3 games for a 4-player court, 5 for 5)
 *   - the most recent game_result write for the current round was
 *     >= IDLE_THRESHOLD_MS ago
 *
 * On a match, the cron runs the same finalize-and-recap pipeline the
 * manual End Session button uses, plus a single push notification to
 * every group admin so they know the system stepped in.
 */

const IDLE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export async function runAutoCompleteIdleSessions(): Promise<{
  checked: number;
  completed: number;
  skipped: number;
}> {
  const supabase = await createServiceClient();

  // Only check sessions whose updated_at is older than the idle
  // threshold. A session whose status flipped to round_complete 2
  // minutes ago can't possibly be 30-min idle, so skipping it at the
  // SQL layer keeps the per-tick read cheap as the platform grows.
  const cutoff = new Date(Date.now() - IDLE_THRESHOLD_MS).toISOString();

  const { data: sessions } = await supabase
    .from("shootout_sessions")
    .select(
      "id, status, group_id, current_round, updated_at, group:shootout_groups(id, name, ladder_type), sheet:signup_sheets(event_date, location, timezone)"
    )
    .in("status", ["round_active", "round_complete"])
    .lte("updated_at", cutoff)
    .limit(50);

  if (!sessions || sessions.length === 0) {
    return { checked: 0, completed: 0, skipped: 0 };
  }

  let completed = 0;
  let skipped = 0;

  for (const raw of sessions) {
    const session = raw as {
      id: string;
      status: string;
      group_id: string;
      current_round: number | null;
      group: { id?: string; name?: string | null; ladder_type?: string | null } | null;
      sheet: { event_date?: string | null; timezone?: string | null; location?: string | null } | null;
    };

    const round = session.current_round || 1;

    // Coverage check — refuses to auto-finalize while play is still
    // in progress. Identical to the rule the manual End Session route
    // enforces, so the cron can't bypass anything a human couldn't
    // bypass on their own.
    const incomplete = await findIncompleteCourts(supabase, session.id, round);
    if (incomplete.length > 0) {
      skipped++;
      continue;
    }

    // Idle check — the latest score for the current round must be
    // older than the threshold. Anchoring on game_results (not on
    // session.updated_at) means we don't fire while admins are
    // actively entering scores, only after the last one lands and
    // nobody advances.
    const lastScoreMs = await lastScoreTimestamp(supabase, session.id, round);
    if (lastScoreMs === null) {
      // No scores at all yet — the coverage check probably let this
      // through because there are no checked-in courts. Defensive
      // skip; nothing to finalize.
      skipped++;
      continue;
    }
    if (Date.now() - lastScoreMs < IDLE_THRESHOLD_MS) {
      skipped++;
      continue;
    }

    const result = await finalizeSession(supabase, session.id);
    if (!result.ok) {
      console.error(`auto-complete: finalize failed for ${session.id}: ${result.error}`);
      skipped++;
      continue;
    }

    // Fan out the same recap every End Session click produces. Fire-
    // and-forget — recap errors don't unwind the status change.
    sendSessionRecap(supabase, session, session.id).catch((err) =>
      console.error(`auto-complete: recap failed for ${session.id}:`, err)
    );

    // Tell every group admin the cron stepped in. Without this they
    // might come back later, find the session already complete, and
    // wonder if a teammate ended it without telling them.
    notifyGroupAdmins(supabase, session).catch((err) =>
      console.error(`auto-complete: admin notify failed for ${session.id}:`, err)
    );

    completed++;
  }

  return { checked: sessions.length, completed, skipped };
}

/**
 * Push a "session auto-ended" notification to every admin of the
 * group that owned the session. Helps the admin who drove home
 * understand why the session moved without their click.
 */
async function notifyGroupAdmins(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  session: {
    id: string;
    group_id: string;
    group: { name?: string | null } | null;
  }
): Promise<void> {
  const { data: admins } = await supabase
    .from("group_memberships")
    .select("player_id")
    .eq("group_id", session.group_id)
    .eq("group_role", "admin");
  if (!admins || admins.length === 0) return;

  const groupName = session.group?.name ?? "Session";
  const title = `${groupName} session auto-ended`;
  const body =
    "All matches were scored and no one advanced the session for 30 minutes, so the system completed it. Step changes and recap notifications have been sent.";

  for (const a of admins as { player_id: string }[]) {
    notify({
      profileId: a.player_id,
      type: "session_recap",
      title,
      body,
      link: `/sessions/${session.id}`,
      groupId: session.group_id,
    }).catch(() => {});
  }
}
