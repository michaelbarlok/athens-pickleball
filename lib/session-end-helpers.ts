import type { SupabaseClient } from "@supabase/supabase-js";
import { notify } from "@/lib/notify";
import { recomputeSessionStats } from "@/lib/session-recompute";
import { formatDateInZone, DEFAULT_TZ } from "@/lib/utils";

/**
 * Helpers shared between the manual /api/sessions/[id]/end route and
 * the auto-complete-idle-sessions cron. Both paths converge on the
 * same finalize-and-recap behavior; the cron just exists to fire it
 * when an admin forgot to click End Session.
 */

interface SessionLike {
  id: string;
  group_id: string;
  group?: { id?: string; name?: string | null; ladder_type?: string | null } | null;
  sheet?: { event_date?: string | null; timezone?: string | null; location?: string | null } | null;
  current_round?: number | null;
  status?: string;
}

/**
 * Verify that every checked-in court has all of its expected games
 * scored for `current_round`. Returns null if complete, or a list of
 * "Court N (M/X)" strings naming the courts that still have gaps.
 *
 * 4-player courts expect 3 games, 5-player courts expect 5. Used by
 * both the End Session route (refuses to advance with gaps) and the
 * auto-complete cron (refuses to fire while play is still in progress).
 */
export async function findIncompleteCourts(
  client: SupabaseClient,
  sessionId: string,
  currentRound: number
): Promise<string[]> {
  const { data: parts } = await client
    .from("session_participants")
    .select("court_number")
    .eq("session_id", sessionId)
    .eq("checked_in", true)
    .not("court_number", "is", null);

  const courtSizes = new Map<number, number>();
  for (const p of parts ?? []) {
    const c = (p as { court_number: number }).court_number;
    courtSizes.set(c, (courtSizes.get(c) ?? 0) + 1);
  }
  if (courtSizes.size === 0) return [];

  const { data: games } = await client
    .from("game_results")
    .select("pool_number")
    .eq("session_id", sessionId)
    .eq("round_number", currentRound);

  const gameCounts = new Map<number, number>();
  for (const g of games ?? []) {
    const n = (g as { pool_number: number }).pool_number;
    gameCounts.set(n, (gameCounts.get(n) ?? 0) + 1);
  }

  const incomplete: string[] = [];
  for (const [courtNum, size] of courtSizes) {
    const expected = size === 5 ? 5 : 3;
    const got = gameCounts.get(courtNum) ?? 0;
    if (got < expected) incomplete.push(`Court ${courtNum} (${got}/${expected})`);
  }
  return incomplete;
}

/**
 * Returns the timestamp (ms) of the most-recent game_result write
 * for this session in the given round, or null if no scores exist.
 * Used by the auto-complete cron to measure idle time after the
 * final score lands.
 */
export async function lastScoreTimestamp(
  client: SupabaseClient,
  sessionId: string,
  currentRound: number
): Promise<number | null> {
  const { data } = await client
    .from("game_results")
    .select("created_at")
    .eq("session_id", sessionId)
    .eq("round_number", currentRound)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0] as { created_at?: string } | undefined;
  if (!row?.created_at) return null;
  const ts = new Date(row.created_at).getTime();
  return Number.isNaN(ts) ? null : ts;
}

/**
 * Finalize a session: recompute pool_finish / step_after if missing,
 * then UPDATE status to session_complete. Idempotent — calling twice
 * with the same sessionId on an already-complete session is a no-op
 * relative to the second call.
 *
 * Returns ok=false with an error string when the recompute step fails;
 * the status update is skipped in that case so the session doesn't
 * end up complete-but-half-baked.
 */
export async function finalizeSession(
  client: SupabaseClient,
  sessionId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  // If pool_finish hasn't been written for any participant but at
  // least one game has been scored, recompute now. Idempotent —
  // skipped when complete-round already ran the same recompute.
  const { data: missingFinish } = await client
    .from("session_participants")
    .select("id")
    .eq("session_id", sessionId)
    .eq("checked_in", true)
    .is("pool_finish", null)
    .limit(1);

  if (missingFinish && missingFinish.length > 0) {
    const { count: scoredGames } = await client
      .from("game_results")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);
    if ((scoredGames ?? 0) > 0) {
      const r = await recomputeSessionStats(client, sessionId);
      if (!r.ok) return { ok: false, error: r.error };
    }
  }

  const { error } = await client
    .from("shootout_sessions")
    .update({ status: "session_complete" })
    .eq("id", sessionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Per-participant "your session recap" push + email. Pulls W-L from
 * game_results and step + finish from session_participants, then
 * fans out via notify(). Caller is responsible for invoking this
 * AFTER finalizeSession() so pool_finish + step_after are written.
 *
 * Errors per-recipient are caught and logged; one player's failure
 * doesn't block the others.
 */
export async function sendSessionRecap(
  client: SupabaseClient,
  session: SessionLike,
  sessionId: string
): Promise<void> {
  const { data: participants } = await client
    .from("session_participants")
    .select("*, player:profiles(id, display_name)")
    .eq("session_id", sessionId)
    .eq("checked_in", true);
  if (!participants || participants.length === 0) return;

  const { data: gameResults } = await client
    .from("game_results")
    .select("team_a_p1, team_a_p2, team_b_p1, team_b_p2, score_a, score_b")
    .eq("session_id", sessionId);

  const wlMap = new Map<string, { wins: number; losses: number }>();
  for (const p of participants as { player_id: string }[]) {
    wlMap.set(p.player_id, { wins: 0, losses: 0 });
  }
  for (const g of (gameResults ?? []) as {
    team_a_p1: string | null;
    team_a_p2: string | null;
    team_b_p1: string | null;
    team_b_p2: string | null;
    score_a: number;
    score_b: number;
  }[]) {
    const teamA = [g.team_a_p1, g.team_a_p2].filter(Boolean) as string[];
    const teamB = [g.team_b_p1, g.team_b_p2].filter(Boolean) as string[];
    const aWon = g.score_a > g.score_b;
    for (const pid of teamA) {
      const s = wlMap.get(pid);
      if (s) (aWon ? s.wins++ : s.losses++);
    }
    for (const pid of teamB) {
      const s = wlMap.get(pid);
      if (s) (!aWon ? s.wins++ : s.losses++);
    }
  }

  const groupName = session.group?.name ?? "Session";
  const sheetTz = session.sheet?.timezone ?? DEFAULT_TZ;
  const eventDate = session.sheet?.event_date
    ? formatDateInZone(session.sheet.event_date, sheetTz)
    : null;

  const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  for (const raw of participants) {
    const p = raw as {
      player_id: string;
      pool_finish: number | null;
      step_before: number | null;
      step_after: number | null;
      court_number: number | null;
      player?: { display_name?: string } | null;
    };
    const playerName = p.player?.display_name ?? "Player";
    const wl = wlMap.get(p.player_id) ?? { wins: 0, losses: 0 };
    const finish = p.pool_finish;
    const stepBefore = p.step_before;
    const stepAfter = p.step_after;
    const courtNumber = p.court_number;

    const parts: string[] = [];
    if (finish != null && courtNumber != null) {
      parts.push(`Finished ${ordinal(finish)} on Court ${courtNumber}.`);
    }
    parts.push(`Record: ${wl.wins}W – ${wl.losses}L.`);
    if (stepBefore != null && stepAfter != null) {
      if (stepAfter !== stepBefore) {
        const dir = stepAfter < stepBefore ? "↑" : "↓";
        parts.push(`Step: ${stepBefore} → ${stepAfter} ${dir}`);
      } else {
        parts.push(`Step: ${stepAfter}`);
      }
    }

    const title = `${groupName} recap${eventDate ? ` — ${eventDate}` : ""}`;
    const body = parts.join(" ");

    notify({
      profileId: p.player_id,
      type: "session_recap",
      title,
      body,
      link: `/sessions/${sessionId}`,
      groupId: session.group_id,
      emailTemplate: "SessionRecap",
      emailData: {
        playerName,
        groupName,
        eventDate,
        courtNumber,
        finish,
        wins: wl.wins,
        losses: wl.losses,
        stepBefore,
        stepAfter,
        sessionId,
      },
    }).catch((err) =>
      console.error(`Recap notification failed for ${p.player_id}:`, err)
    );
  }
}
