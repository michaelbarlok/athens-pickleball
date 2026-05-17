/**
 * Shared `join a group` logic. The single source of truth used by both
 * the `/api/groups/[id]/join` route (driven by the new click flow that
 * also handles club gating) and any other surface that needs to put a
 * profile into `group_memberships`.
 *
 * Order of operations:
 *
 *   1. **Archive restore.** If a `left_group_memberships` row exists,
 *      we re-upsert the original stats (current_step, win_pct,
 *      total_sessions, last_played_at, imported_win_pct,
 *      signup_priority) and delete the archive. group_role is always
 *      reset to 'member' on rejoin — re-promotion is an admin action.
 *
 *   2. **Pending claim.** If the player has a `pending_group_memberships`
 *      row (admin pre-seeded them), `claimPendingMemberships` walks
 *      that into a real membership with the imported stats intact.
 *
 *   3. **Fresh insert.** Otherwise, write a new row with the group's
 *      configured `new_player_start_step` (ladder) or a default of 5.
 *
 * Idempotent: re-running for an already-joined member is a no-op
 * (upsert + onConflict).
 *
 * After the membership lands we kick off badge checks in the
 * background — `community` and `ladder` for the player. We don't
 * await so the join request stays fast; failures are swallowed
 * silently the same way they were before this extraction.
 */
import { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export async function joinGroupForUser({
  service,
  groupId,
  playerId,
  playerDisplayName,
  playerEmail,
  groupType,
}: {
  service: ServiceClient;
  groupId: string;
  playerId: string;
  playerDisplayName: string;
  playerEmail: string;
  groupType: string;
}): Promise<void> {
  // 1. Archive restore
  const { data: archived } = await service
    .from("left_group_memberships")
    .select("*")
    .eq("group_id", groupId)
    .eq("player_id", playerId)
    .maybeSingle();

  let usedArchive = false;
  if (archived) {
    const { error: restoreErr } = await service.from("group_memberships").upsert(
      {
        group_id: groupId,
        player_id: playerId,
        current_step: archived.current_step,
        win_pct: archived.win_pct,
        total_sessions: archived.total_sessions,
        last_played_at: archived.last_played_at,
        imported_win_pct: archived.imported_win_pct,
        signup_priority: archived.signup_priority ?? "normal",
        group_role: "member",
      },
      { onConflict: "group_id,player_id" }
    );
    if (!restoreErr) {
      await service
        .from("left_group_memberships")
        .delete()
        .eq("group_id", groupId)
        .eq("player_id", playerId);
      usedArchive = true;
    }
  }

  // 2. Pending claim
  let usedPending = false;
  if (!usedArchive) {
    const { claimPendingMemberships } = await import("@/lib/pending-memberships");
    const before = await service
      .from("group_memberships")
      .select("player_id")
      .eq("group_id", groupId)
      .eq("player_id", playerId)
      .maybeSingle();

    if (!before.data) {
      await claimPendingMemberships(service, playerId, playerDisplayName, playerEmail, groupId);
      const after = await service
        .from("group_memberships")
        .select("player_id")
        .eq("group_id", groupId)
        .eq("player_id", playerId)
        .maybeSingle();
      usedPending = !!after.data;
    }
  }

  // 3. Fresh insert (default starting step from group_preferences for ladders)
  if (!usedArchive && !usedPending) {
    let startStep = 5;
    if (groupType === "ladder_league") {
      const { data: prefs } = await service
        .from("group_preferences")
        .select("new_player_start_step")
        .eq("group_id", groupId)
        .maybeSingle();
      startStep = prefs?.new_player_start_step ?? 5;
    }

    await service.from("group_memberships").upsert(
      {
        group_id: groupId,
        player_id: playerId,
        current_step: startStep,
        win_pct: 0,
        total_sessions: 0,
      },
      { onConflict: "group_id,player_id" }
    );
  }

  // Background badge check — fire-and-forget, same as the previous
  // inline JoinButton implementation. Failures are swallowed.
  const { checkAndAwardBadges } = await import("@/lib/badges");
  checkAndAwardBadges(playerId, ["community", "ladder"]).catch(() => {});
}
