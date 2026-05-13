import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/sessions/[id]/add-guest
 *
 * Adds a one-time guest participant to a session in a private group.
 * Creates an ephemeral profile (is_guest=true, no auth account, no
 * group_membership) then inserts a session_participants row.
 *
 * Because the guest has no group_membership, every downstream stat
 * pipeline ignores them — win_pct recompute and step movement after
 * the round silently skip rows for players who aren't members of
 * the group. The guest stays visible in this session's history
 * forever (their session_participants row + game_results rows
 * persist) but doesn't pollute the group ladder.
 *
 * Body: { display_name: string, email?: string, step?: number }
 *   - step defaults to 1 (top of the ladder) for headroom; admin
 *     can pick anything in the group's configured range.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;
  const body = await request.json();
  const displayName = (body.display_name ?? "").trim();
  const email: string | null = (body.email ?? "").trim() || null;
  const stepRaw = body.step;
  const step =
    typeof stepRaw === "number" && Number.isFinite(stepRaw) && stepRaw >= 1
      ? Math.floor(stepRaw)
      : 1;

  if (!displayName) {
    return NextResponse.json({ error: "Guest name is required" }, { status: 400 });
  }

  // Fetch session + group to verify private group
  const { data: session } = await auth.supabase
    .from("shootout_sessions")
    .select("*, group:shootout_groups(id, visibility)")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.group?.visibility !== "private") {
    return NextResponse.json(
      { error: "Guests can only be added to private group sessions" },
      { status: 403 }
    );
  }

  // Guest profile insert + participant insert run under the service
  // client. RLS on profiles only allows a user to insert their OWN
  // profile (WITH CHECK auth.uid() = user_id); a guest profile has
  // user_id=NULL so the user-scoped client gets "new row violates
  // row-level security policy." Admin authorization is already
  // verified above via requireAdmin(); the service-client step is
  // just RLS bypass for a known-authorized write.
  const sc = await createServiceClient();

  const { data: guestProfile, error: profileError } = await sc
    .from("profiles")
    .insert({
      display_name: `${displayName} (Guest)`,
      full_name: displayName,
      email: email ?? `guest-${crypto.randomUUID()}@tristar-guest.invalid`,
      is_guest: true,
      role: "player",
    })
    .select("id")
    .single();

  if (profileError || !guestProfile) {
    return NextResponse.json(
      { error: profileError?.message ?? "Failed to create guest profile" },
      { status: 500 }
    );
  }

  // Add guest as a checked-in session participant with the admin's
  // chosen step. The seeding algorithm uses step_before to decide
  // which court a player goes on, so picking a sensible step here
  // is what controls where the guest slots in.
  const { error: partError } = await sc
    .from("session_participants")
    .insert({
      session_id: sessionId,
      group_id: session.group_id,
      player_id: guestProfile.id,
      checked_in: true,
      step_before: step,
    });

  if (partError) {
    // Clean up the orphaned profile if participant insert fails.
    await sc.from("profiles").delete().eq("id", guestProfile.id);
    return NextResponse.json(
      { error: partError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    id: guestProfile.id,
    display_name: `${displayName} (Guest)`,
    step,
  });
}
