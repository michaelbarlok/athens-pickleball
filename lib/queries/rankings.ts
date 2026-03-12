import { createClient } from "@/lib/supabase/server";

/**
 * Recalculate win % for a player in a group using the rolling window.
 * Only counts the last N sessions per group_preferences.pct_window_sessions.
 */
export async function recalculateWinPct(
  groupId: string,
  playerId: string
): Promise<number> {
  const supabase = await createClient();

  // Get the window size
  const { data: prefs } = await supabase
    .from("group_preferences")
    .select("pct_window_sessions")
    .eq("group_id", groupId)
    .single();

  const windowSize = prefs?.pct_window_sessions ?? 6;

  // Get the last N completed sessions this player participated in
  const { data: recentSessions } = await supabase
    .from("shootout_sessions")
    .select("id")
    .eq("group_id", groupId)
    .eq("status", "session_complete")
    .order("created_at", { ascending: false })
    .limit(windowSize);

  if (!recentSessions || recentSessions.length === 0) return 0;

  const sessionIds = recentSessions.map((s) => s.id);

  // Get game results for this player in those sessions
  const { data: games } = await supabase
    .from("game_results")
    .select("*")
    .eq("group_id", groupId)
    .in("session_id", sessionIds)
    .or(
      `team_a_p1.eq.${playerId},team_a_p2.eq.${playerId},team_b_p1.eq.${playerId},team_b_p2.eq.${playerId}`
    );

  if (!games || games.length === 0) return 0;

  let totalWins = 0;
  let totalGames = 0;

  for (const game of games) {
    const onTeamA =
      game.team_a_p1 === playerId || game.team_a_p2 === playerId;
    const won = onTeamA
      ? game.score_a > game.score_b
      : game.score_b > game.score_a;

    if (won) totalWins++;
    totalGames++;
  }

  const winPct =
    totalGames > 0
      ? Math.round((totalWins / totalGames) * 10000) / 100
      : 0;

  // Update group_memberships
  await supabase
    .from("group_memberships")
    .update({ win_pct: winPct })
    .eq("group_id", groupId)
    .eq("player_id", playerId);

  return winPct;
}

/**
 * Recalculate win % for ALL players in a group.
 * Called after a session completes.
 */
export async function recalculateAllWinPcts(groupId: string): Promise<void> {
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("group_memberships")
    .select("player_id")
    .eq("group_id", groupId);

  if (!members) return;

  await Promise.allSettled(
    members.map((m) => recalculateWinPct(groupId, m.player_id))
  );
}
