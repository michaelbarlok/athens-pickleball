import { requireAdmin } from "@/lib/auth";
import { findIncompleteCourts } from "@/lib/session-end-helpers";
import { recomputeSessionStats } from "@/lib/session-recompute";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/sessions/[id]/recompute
 *
 * Re-derive pool_finish, win_pct, step_after, and target_court_next from
 * the current `game_results` rows for this session. Called after an admin
 * edits a score on a round_complete or session_complete session so the
 * stats stay consistent with the corrected scores.
 *
 * For a round_active session we refuse to fire unless every court has
 * all of its expected games entered. Without that guard a partial-data
 * recompute stamps pool_finish based on whatever scores happen to be
 * in at the moment, then the live UI's `poolFinishMap` override keeps
 * honoring that stale stamp even as more scores land — which is what
 * scrambled Court 2 on the Athens 5/18 session. (The live preview now
 * also gates the override to round_complete / session_complete, so even
 * if a partial recompute slips through, the live UI won't sort on the
 * stale value. This guard belt-and-suspenders the data side.)
 *
 * If the coverage check fails we also blank any pool_finish /
 * tiebreaker_reason already stamped on this session. That's how we
 * recover from rows whose pool_finish was stamped by a prior partial
 * recompute (anything left over from before this fix) — caller gets a
 * 400 explaining what's missing, and the live UI flips back to
 * computing from live scores on the next render.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

  const { data: session } = await auth.supabase
    .from("shootout_sessions")
    .select("status, current_round")
    .eq("id", sessionId)
    .single();
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Active round → coverage check first. Without complete scores
  // pool_finish has no defensible meaning.
  if (session.status === "round_active") {
    const incomplete = await findIncompleteCourts(
      auth.supabase,
      sessionId,
      session.current_round || 1
    );
    if (incomplete.length > 0) {
      // Best effort: wipe any stale pool_finish that an earlier
      // partial-data recompute left behind. We use the service client
      // because session_participants RLS is restrictive and we don't
      // want this housekeeping to silently no-op.
      const admin = await createServiceClient();
      await admin
        .from("session_participants")
        .update({ pool_finish: null, tiebreaker_reason: null })
        .eq("session_id", sessionId)
        .eq("checked_in", true);

      return NextResponse.json(
        {
          error: `Score every game before recomputing — incomplete: ${incomplete.join(", ")}. Any stale pool_finish has been cleared.`,
        },
        { status: 400 }
      );
    }
  }

  // Only re-run the step RPC when the round is already complete; it writes
  // step_after and moves current_step, and we don't want that mid-round.
  const skipSteps =
    session.status !== "round_complete" && session.status !== "session_complete";

  const result = await recomputeSessionStats(auth.supabase, sessionId, { skipSteps });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, stepsUpdated: !skipSteps });
}
