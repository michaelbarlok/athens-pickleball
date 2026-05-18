import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function recalculateWinPct(
  groupId: string,
  playerId: string,
  client?: SupabaseClient
): Promise<number> {
  const supabase = client ?? (await createClient());

  // Get the window size
  const { data: prefs } = await supabase
    .from("group_preferences")
    .select("pct_window_sessions")
    .eq("group_id", groupId)
    .single();

  const windowSize = prefs?.pct_window_sessions ?? 6;

  // Get the last N completed sessions this player actually checked into
  const { data: recentParticipations } = await supabase
    .from("session_participants")
    .select("session_id, shootout_sessions!inner(group_id, status)")
    .eq("player_id", playerId)
    .eq("checked_in", true)
    .eq("shootout_sessions.group_id", groupId)
    .eq("shootout_sessions.status", "session_complete")
    .order("session_id", { ascending: false })
    .limit(windowSize);

  if (!recentParticipations || recentParticipations.length === 0) {
    // No remaining sessions for this player — reset the stored value
    // so a previous non-zero win_pct doesn't linger after the source
    // sessions were deleted. Without this update, the early return
    // silently leaves the stale value in place.
    await supabase
      .from("group_memberships")
      .update({ win_pct: 0 })
      .eq("group_id", groupId)
      .eq("player_id", playerId);
    return 0;
  }

  const sessionIds = recentParticipations.map((p) => p.session_id);

  // Get game results for this player in those sessions. We only need
  // the four player slots (to detect side) and the two scores, not the
  // full row — this function runs N times in recalculateAllWinPcts.
  const { data: games } = await supabase
    .from("game_results")
    .select("team_a_p1, team_a_p2, score_a, score_b")
    .eq("group_id", groupId)
    .in("session_id", sessionIds)
    .or(
      `team_a_p1.eq.${playerId},team_a_p2.eq.${playerId},team_b_p1.eq.${playerId},team_b_p2.eq.${playerId}`
    );

  if (!games || games.length === 0) {
    await supabase
      .from("group_memberships")
      .update({ win_pct: 0 })
      .eq("group_id", groupId)
      .eq("player_id", playerId);
    return 0;
  }

  let pointsScored = 0;
  let pointsPossible = 0;

  for (const game of games) {
    const onTeamA =
      game.team_a_p1 === playerId || game.team_a_p2 === playerId;

    // Points possible per game = the higher score (accounts for win-by-2)
    const maxScore = Math.max(game.score_a, game.score_b);
    pointsPossible += maxScore;
    pointsScored += onTeamA ? game.score_a : game.score_b;
  }

  const pointPct =
    pointsPossible > 0
      ? Math.round((pointsScored / pointsPossible) * 10000) / 100
      : 0;

  // Update group_memberships
  await supabase
    .from("group_memberships")
    .update({ win_pct: pointPct })
    .eq("group_id", groupId)
    .eq("player_id", playerId);

  return pointPct;
}

/**
 * Recalculate point percentage for ALL players in a group.
 * Called after a session completes.
 */
export async function recalculateAllWinPcts(
  groupId: string,
  client?: SupabaseClient
): Promise<void> {
  const supabase = client ?? (await createClient());

  const { data: members } = await supabase
    .from("group_memberships")
    .select("player_id")
    .eq("group_id", groupId);

  if (!members) return;

  await Promise.allSettled(
    members.map((m) => recalculateWinPct(groupId, m.player_id, supabase))
  );
}

/**
 * Decrement `group_memberships.total_sessions` to reverse the bumps
 * applied by `update_steps_on_round_complete` (migration 079) for a
 * set of about-to-be-deleted completed sessions. Per session, every
 * checked-in player had their counter bumped by 1 at completion; this
 * helper subtracts 1 per checked-in participation per deleted
 * session.
 *
 * Why per-delete rather than a wholesale resync: `total_sessions` is
 * the COMBINED count of imported-baseline + on-platform sessions
 * (`imported_win_pct` is stored separately, but the imported session
 * count was rolled directly into `total_sessions` at import time —
 * there is no separate `imported_sessions` column). A blanket
 * "set to actual count of session_complete rows" would silently nuke
 * every imported player's baseline (e.g. Athens players with imported
 * 14 + on-platform 8 = 22 would all collapse to 8).
 *
 * Pass the session ids that are *about to be* cascade-deleted — call
 * this BEFORE the delete runs so we can read the participants. We
 * GREATEST(0, ...) to keep the counter non-negative in case prior
 * drift already pushed a row below the imported baseline.
 */
export async function subtractSessionsFromTotals(
  sessionIds: string[],
  client?: SupabaseClient
): Promise<void> {
  if (sessionIds.length === 0) return;
  const supabase = client ?? (await createClient());

  // Restrict to checked-in participants of *completed* sessions —
  // those are the only rows that bumped total_sessions. An
  // in-progress / abandoned session deleted via cascade never bumped
  // anyone, so it has nothing to subtract. We also pull group_id off
  // the embedded session so we can scope the decrement to the right
  // membership row (a player can be in multiple groups).
  const { data: rows } = await supabase
    .from("session_participants")
    .select("player_id, shootout_sessions!inner(status, group_id)")
    .in("session_id", sessionIds)
    .eq("checked_in", true)
    .eq("shootout_sessions.status", "session_complete");

  // Aggregate by (group_id, player_id) tuple. Same player counted
  // once per completed session they were checked into.
  const decBy = new Map<string, { groupId: string; playerId: string; count: number }>();
  for (const r of (rows ?? []) as Array<{
    player_id: string;
    shootout_sessions: { group_id: string } | { group_id: string }[] | null;
  }>) {
    const ss = r.shootout_sessions;
    const groupId = Array.isArray(ss) ? ss[0]?.group_id : ss?.group_id;
    if (!groupId) continue;
    const key = `${groupId}|${r.player_id}`;
    const prev = decBy.get(key);
    if (prev) prev.count += 1;
    else decBy.set(key, { groupId, playerId: r.player_id, count: 1 });
  }
  if (decBy.size === 0) return;

  // One round trip per affected membership. Counts are tiny in
  // practice (a single session-delete touches the players who
  // checked in to that session, typically <40).
  await Promise.allSettled(
    Array.from(decBy.values()).map(async ({ groupId, playerId, count }) => {
      const { data: current } = await supabase
        .from("group_memberships")
        .select("total_sessions")
        .eq("group_id", groupId)
        .eq("player_id", playerId)
        .maybeSingle();
      const next = Math.max(0, (current?.total_sessions ?? 0) - count);
      await supabase
        .from("group_memberships")
        .update({ total_sessions: next })
        .eq("group_id", groupId)
        .eq("player_id", playerId);
    })
  );
}
