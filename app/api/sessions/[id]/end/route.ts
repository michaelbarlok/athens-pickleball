import { requireAuth, isGroupAdmin } from "@/lib/auth";
import {
  findIncompleteCourts,
  finalizeSession,
  sendSessionRecap,
} from "@/lib/session-end-helpers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

  // Parse body — sendRecap can be set to false from the Play Again flow,
  // which calls this endpoint internally to finalize step movement and
  // target_court_next without notifying every player they're "done."
  let sendRecap = true;
  try {
    const body = await request.json();
    if (body && body.sendRecap === false) sendRecap = false;
  } catch {
    // No body — keep default sendRecap=true (the End Session button case).
  }

  // Fetch session with group and sheet info
  const { data: session } = await auth.supabase
    .from("shootout_sessions")
    .select("*, group:shootout_groups(id, name, ladder_type), sheet:signup_sheets(event_date, location, timezone)")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Verify caller is group admin or app admin
  const canManage = await isGroupAdmin(auth.supabase, auth.profile.id, session.group_id, auth.profile.role);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (session.status === "session_complete") {
    return NextResponse.json({ error: "Session is already complete" }, { status: 400 });
  }

  // If a round is in progress, every expected game has to be scored
  // before we'll let the session be finalized. Same rule complete-round
  // already enforces — having it here too means no path (Play Again,
  // End Session, or a direct API call) can advance past round_active
  // with partial or zero scores, which is what produced null targets
  // and the rank-sort fallback in Athens earlier this week.
  if (session.status === "round_active") {
    const incomplete = await findIncompleteCourts(
      auth.supabase,
      sessionId,
      session.current_round || 1
    );
    if (incomplete.length > 0) {
      return NextResponse.json(
        {
          error: `Score every game before ending the session — incomplete: ${incomplete.join(", ")}.`,
        },
        { status: 400 }
      );
    }
  }

  const result = await finalizeSession(auth.supabase, sessionId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Recap is suppressed when called from Play Again — those players are
  // about to be re-seeded into the next session, so a "your session is
  // done" push is wrong.
  if (sendRecap) {
    sendSessionRecap(auth.supabase, session, sessionId).catch((err) =>
      console.error("Session recap notifications failed:", err)
    );
  }

  return NextResponse.json({ status: "session_complete" });
}
