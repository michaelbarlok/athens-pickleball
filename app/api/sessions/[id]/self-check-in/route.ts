import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/sessions/[id]/self-check-in
 *
 * A player taps "I'm here" on their phone and this lands. RLS on
 * session_participants doesn't let regular players UPDATE their own
 * row (it's locked to site admins + group admins), so we run the
 * write under the service client after verifying:
 *
 *   - the session is in checking_in status (no late check-ins to
 *     already-running rounds)
 *   - the caller's profile is on the participant roster for this
 *     session (no one checks in for a session they weren't signed
 *     up to)
 *
 * Returns { checked_in: true } on success. Idempotent — re-tapping
 * is a no-op rather than an error.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

  const { data: session } = await auth.supabase
    .from("shootout_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .single();
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.status !== "checking_in") {
    return NextResponse.json(
      { error: "Check-in isn't open for this session." },
      { status: 400 }
    );
  }

  // Confirm the caller is on the roster. session_participants rows
  // are created when an admin opens check-in (or via roster import
  // from the sign-up sheet) — players can't self-add to a session
  // they weren't signed up for.
  const { data: participant } = await auth.supabase
    .from("session_participants")
    .select("checked_in")
    .eq("session_id", sessionId)
    .eq("player_id", auth.profile.id)
    .maybeSingle();
  if (!participant) {
    return NextResponse.json(
      { error: "You're not on the roster for this session." },
      { status: 403 }
    );
  }

  if (participant.checked_in) {
    // Already checked in — make the call idempotent.
    return NextResponse.json({ checked_in: true });
  }

  // Service client bypasses the admin-only RLS on
  // session_participants. The roster + status guards above are the
  // real gate.
  const sc = await createServiceClient();
  const { error } = await sc
    .from("session_participants")
    .update({ checked_in: true })
    .eq("session_id", sessionId)
    .eq("player_id", auth.profile.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ checked_in: true });
}
