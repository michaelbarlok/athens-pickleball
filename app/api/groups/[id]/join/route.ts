/**
 * POST /api/groups/[id]/join
 *
 * Single entry point for joining a group. Wraps the shared
 * `joinGroupForUser` helper with the new club-gating rule:
 *
 *   "If the group is part of a club, you must also be a member of that
 *    club to join the group."
 *
 * Flow:
 *
 *   - If the group has no parent club: just join.
 *
 *   - If the group has a public parent club and the user is already a
 *     club member: just join.
 *
 *   - If the group has a parent club and the user is NOT yet a club
 *     member:
 *       - First call (no `acceptClub` in body) returns 409 with the
 *         club summary so the client can surface a "You must join
 *         {club}. Join both?" confirmation popup.
 *       - Second call with `{ acceptClub: true }` joins the club (or
 *         400-fails for private clubs, where joining requires an
 *         invite that must be redeemed on the club page directly) and
 *         then proceeds with the group join.
 *
 * The club-gating is intentionally enforced server-side, not just in
 * the UI, so any future direct-API caller (mobile app, integration)
 * is held to the same rule. Future paid-club gating slots in at the
 * same boundary — when an admin enables a paywall on the club, this
 * route is where the Stripe checkout would short-circuit before the
 * `acceptClub` upsert.
 */
import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { joinGroupForUser } from "@/lib/group-join";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: groupId } = await params;
  const body = await request.json().catch(() => ({}));
  const acceptClub = body?.acceptClub === true;

  const service = await createServiceClient();

  // Fetch group + parent-club summary in one round trip.
  const { data: group } = await service
    .from("shootout_groups")
    .select(
      "id, group_type, club_id, club:clubs(id, name, slug, visibility, is_active)"
    )
    .eq("id", groupId)
    .maybeSingle();
  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // PostgREST returns the embedded join as an object (not an array)
  // when the FK is single-valued; cast through unknown to satisfy
  // the inferred shape vs the runtime shape.
  const club = (group as unknown as {
    club: { id: string; name: string; slug: string; visibility: string; is_active: boolean } | null;
  }).club;

  // Club gating
  if (club && club.is_active) {
    const { data: existingMembership } = await service
      .from("club_memberships")
      .select("profile_id")
      .eq("club_id", club.id)
      .eq("profile_id", auth.profile.id)
      .maybeSingle();

    if (!existingMembership) {
      // Site admins bypass — they can already manage everything else.
      if (auth.profile.role !== "admin") {
        if (!acceptClub) {
          return NextResponse.json(
            {
              requiresClubJoin: true,
              club: {
                id: club.id,
                name: club.name,
                slug: club.slug,
                visibility: club.visibility,
              },
            },
            { status: 409 }
          );
        }
        // Caller accepted joining both. Auto-join is only safe for
        // public clubs — private clubs require an invite that must be
        // redeemed on the club page directly.
        if (club.visibility !== "public") {
          return NextResponse.json(
            {
              error:
                "This group is part of a private club. Open the club page and redeem your invite link first.",
              clubSlug: club.slug,
            },
            { status: 403 }
          );
        }
        const { error: clubJoinErr } = await service
          .from("club_memberships")
          .upsert(
            {
              club_id: club.id,
              profile_id: auth.profile.id,
              club_role: "member",
            },
            { onConflict: "club_id,profile_id", ignoreDuplicates: true }
          );
        if (clubJoinErr) {
          return NextResponse.json(
            { error: clubJoinErr.message },
            { status: 500 }
          );
        }
      }
    }
  }

  // Pull the profile fields the join helper needs (pending-claim path
  // matches against display_name + email).
  const { data: playerProfile } = await service
    .from("profiles")
    .select("display_name, email")
    .eq("id", auth.profile.id)
    .single();
  if (!playerProfile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  await joinGroupForUser({
    service,
    groupId,
    playerId: auth.profile.id,
    playerDisplayName: playerProfile.display_name,
    playerEmail: playerProfile.email,
    groupType: group.group_type,
  });

  return NextResponse.json({ ok: true });
}
