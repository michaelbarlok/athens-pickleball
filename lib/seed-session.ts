import type { SupabaseClient } from "@supabase/supabase-js";
import {
  seedParticipantsForSession,
  type SeedablePlayer,
} from "@/lib/shootout-engine";
import { recomputeSessionStats } from "@/lib/session-recompute";

/**
 * Server-side seeding orchestrator.
 *
 * Mirrors the decision logic of the admin Check-In page's "Seed"
 * button so a session can be seeded without a human opening that
 * page. Used by /api/sessions/[id]/start to auto-recover a session
 * that reached the start step with no court assignments (an admin
 * walked the lifecycle status forward without ever running Seed).
 *
 * Decision (identical to the Check-In page):
 *   - Court Promotion same-day continuation, every checked-in player
 *     has a target_court_next, and the court count didn't grow →
 *     `seedSameDaySession` (anchored one-up-one-down).
 *   - Session 1, Dynamic Ranking, a court-count increase, or a
 *     continuation whose targets couldn't be rebuilt → `seedSession1`
 *     (ranking-sheet sort by step / point% / recency).
 *
 * The engine functions are pure; this wrapper just gathers inputs,
 * picks the algorithm, and writes `court_number`.
 *
 * Only ever called when ZERO checked-in players hold a court — it
 * never re-seeds a session an admin already arranged by hand.
 */
export type AutoSeedResult =
  | { ok: true; seated: number; mode: "continuation" | "ranking" }
  | { ok: false; error: string };

interface MembershipRanking {
  current_step: number;
  win_pct: number;
  last_played_at: string | null;
  total_sessions: number;
}

export async function autoSeedSession(
  service: SupabaseClient,
  sessionId: string
): Promise<AutoSeedResult> {
  const { data: session } = await service
    .from("shootout_sessions")
    .select(
      "id, num_courts, group_id, is_same_day_continuation, prev_session_id, group:shootout_groups(ladder_type)"
    )
    .eq("id", sessionId)
    .single();
  if (!session) return { ok: false, error: "Session not found" };

  const numCourts = session.num_courts as number;
  const ladderType =
    (session as unknown as { group?: { ladder_type?: string } | null }).group
      ?.ladder_type ?? "court_promotion";
  const isDynamicRanking = ladderType === "dynamic_ranking";
  const isContinuation =
    !!session.is_same_day_continuation && !!session.prev_session_id;

  // Checked-in participants. court_number is intentionally not read —
  // the caller only invokes this when none are seated.
  const { data: parts } = await service
    .from("session_participants")
    .select("id, player_id, target_court_next")
    .eq("session_id", sessionId)
    .eq("checked_in", true);
  if (!parts || parts.length === 0) {
    return { ok: false, error: "No checked-in players to seed" };
  }
  if (parts.length < 4) {
    return {
      ok: false,
      error: `Need at least 4 checked-in players to seed (have ${parts.length}).`,
    };
  }

  // Ranking snapshot from group_memberships — the same fields the
  // Check-In page joins onto each participant row.
  const playerIds = parts.map((p) => p.player_id);
  const { data: memberships } = await service
    .from("group_memberships")
    .select("player_id, current_step, win_pct, last_played_at, total_sessions")
    .eq("group_id", session.group_id)
    .in("player_id", playerIds);
  const memberMap = new Map<string, MembershipRanking>();
  for (const m of memberships ?? []) {
    memberMap.set((m as { player_id: string }).player_id, {
      current_step: (m as MembershipRanking).current_step,
      win_pct: (m as MembershipRanking).win_pct,
      last_played_at: (m as MembershipRanking).last_played_at,
      total_sessions: (m as MembershipRanking).total_sessions,
    });
  }

  // Target-court map for the continuation path. If a court-promotion
  // continuation is missing any target, rebuild them by recomputing
  // the previous session (same self-heal the Check-In page does via
  // /api/sessions/[id]/sync-prev-targets). Idempotent.
  let targetByPlayer = new Map<string, number | null>(
    parts.map((p) => [p.player_id, p.target_court_next as number | null])
  );
  if (isContinuation && !isDynamicRanking) {
    const missing = parts.some(
      (p) => targetByPlayer.get(p.player_id) == null
    );
    if (missing && session.prev_session_id) {
      await recomputeSessionStats(service, session.prev_session_id).catch(
        () => {
          /* fall through — handled by the all-targets check below */
        }
      );
      const { data: refreshed } = await service
        .from("session_participants")
        .select("player_id, target_court_next")
        .eq("session_id", sessionId);
      if (refreshed) {
        targetByPlayer = new Map(
          refreshed.map((r: { player_id: string; target_court_next: number | null }) => [
            r.player_id,
            r.target_court_next,
          ])
        );
      }
    }
  }

  const seedablePlayers: SeedablePlayer[] = parts.map((p) => {
    const m = memberMap.get(p.player_id);
    const tc = targetByPlayer.get(p.player_id) ?? null;
    return {
      id: p.player_id,
      currentStep: m?.current_step ?? 1,
      winPct: m?.win_pct ?? 0,
      lastPlayedAt: m?.last_played_at ?? null,
      totalSessions: m?.total_sessions ?? 0,
      targetCourtNext: tc,
      seedSource: tc != null ? "previous_court" : "ranking_sheet",
    };
  });

  let positions: { playerId: string; courtNumber: number }[];
  let mode: "continuation" | "ranking";

  try {
    // Same decision the Check-In page's Seed button uses.
    const result = seedParticipantsForSession({
      players: seedablePlayers,
      numCourts,
      isContinuation,
      isDynamicRanking,
    });

    // The one case to refuse: a Court Promotion continuation that
    // landed in seedSameDaySession with NO target anchors at all
    // (even after the sync above). Letting it through would silently
    // rank-seed — the Athens placement bug.
    if (result.mode === "continuation" && result.noneHaveTargets) {
      return {
        ok: false,
        error:
          "Couldn't rebuild target courts from the previous session. Open Manage Check-In and tap Seed to place players manually.",
      };
    }

    positions = result.positions;
    mode = result.mode;
  } catch (e) {
    // distributeCourts throws on un-seedable counts (e.g. 6 players
    // across 1 court → 6 on a court, max is 5).
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Seeding failed",
    };
  }

  const partByPlayer = new Map(parts.map((p) => [p.player_id, p.id]));
  await Promise.all(
    positions.map((pos) => {
      const rowId = partByPlayer.get(pos.playerId);
      return rowId
        ? service
            .from("session_participants")
            .update({ court_number: pos.courtNumber })
            .eq("id", rowId)
        : Promise.resolve();
    })
  );

  return { ok: true, seated: positions.length, mode };
}
