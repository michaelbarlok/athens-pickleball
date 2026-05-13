import { requireAuth, isGroupAdmin } from "@/lib/auth";
import { checkAndAwardBadges } from "@/lib/badges";
import { recomputeSessionStats } from "@/lib/session-recompute";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/sessions/[id]/complete-round
 *
 * Called when admin advances from round_active -> round_complete.
 * 1. Validates all courts have all scores submitted
 * 2. Delegates to recomputeSessionStats() which:
 *    - computes pool_finish (with tie-breaking) for each player
 *    - updates win_pct (point %) in group_memberships (rolling window)
 *    - calls update_steps_on_round_complete RPC (step_after, target_court_next)
 * 3. Advances session status to round_complete
 *
 * Auth: this handler used to require site admin (requireAdmin). That
 * blocked legitimate group admins from advancing their own group's
 * rounds — they got 403 on "Advance to Round Complete" while every
 * sibling endpoint (/start, /end) accepted them via isGroupAdmin.
 * Now matches the sibling pattern: any authenticated user who is
 * either site admin or admin of the session's group can call this.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

  // Narrow each select to just the columns this handler reads.
  // The full row of game_results in particular has 12+ columns; we
  // only need 1 (pool_number) for the coverage check below.
  const { data: session } = await auth.supabase
    .from("shootout_sessions")
    .select("status, current_round, group_id")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Group-scoped authorization. isGroupAdmin short-circuits to true
  // for site admins, so this single check covers both roles.
  const canManage = await isGroupAdmin(
    auth.supabase,
    auth.profile.id,
    session.group_id,
    auth.profile.role
  );
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (session.status !== "round_active") {
    return NextResponse.json(
      { error: "Session is not in round_active status" },
      { status: 400 }
    );
  }

  // Validate coverage before recomputing: every court must have every
  // game scored, otherwise pool_finish is meaningless.
  const { data: participants } = await auth.supabase
    .from("session_participants")
    .select("player_id, court_number")
    .eq("session_id", sessionId)
    .eq("checked_in", true)
    .not("court_number", "is", null);

  if (!participants || participants.length === 0) {
    return NextResponse.json(
      { error: "No participants with court assignments" },
      { status: 400 }
    );
  }

  const courtMap = new Map<number, typeof participants>();
  for (const p of participants) {
    const court = p.court_number!;
    if (!courtMap.has(court)) courtMap.set(court, []);
    courtMap.get(court)!.push(p);
  }

  const { data: gameResults } = await auth.supabase
    .from("game_results")
    .select("pool_number")
    .eq("session_id", sessionId)
    .eq("round_number", session.current_round || 1);

  for (const [courtNum, courtPlayers] of courtMap) {
    const courtScores = (gameResults ?? []).filter((g) => g.pool_number === courtNum);
    const expectedGames = courtPlayers.length === 5 ? 5 : 3;
    if (courtScores.length < expectedGames) {
      return NextResponse.json(
        { error: `Court ${courtNum} has ${courtScores.length}/${expectedGames} games submitted` },
        { status: 400 }
      );
    }
  }

  const result = await recomputeSessionStats(auth.supabase, sessionId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  await auth.supabase
    .from("shootout_sessions")
    .update({ status: "round_complete" })
    .eq("id", sessionId);

  for (const p of participants) {
    checkAndAwardBadges(p.player_id, ["play", "winning", "ladder", "rating"]).catch((err) =>
      console.error(`Badge check failed for player ${p.player_id}:`, err)
    );
  }

  return NextResponse.json({ status: "round_complete" });
}
