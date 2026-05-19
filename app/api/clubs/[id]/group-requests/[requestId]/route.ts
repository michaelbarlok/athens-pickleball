/**
 * POST /api/clubs/[id]/group-requests/[requestId]
 *
 * Approves or rejects a pending club-attach request. Body:
 *   { action: 'approve' } | { action: 'reject' }
 *
 * Auth: club admin (or site admin) for the named club.
 *
 * Approval:
 *   - sets shootout_groups.club_id to the club id
 *   - marks the request row 'approved' + records reviewer/timestamp
 *   - syncs tournament_organizers via the existing trigger (no
 *     direct write needed here)
 *   - notifies the requester
 *
 * Rejection:
 *   - leaves the group untouched (still standalone)
 *   - marks the request row 'rejected' + records reviewer/timestamp
 *   - notifies the requester
 *
 * Race-safety: the UNIQUE(club_id, group_id) constraint on
 * club_group_requests means a stale double-approve will no-op on the
 * second attempt; we still re-read the request and short-circuit if
 * already resolved.
 */
import { getClubManager } from "@/lib/club-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id: clubId, requestId } = await params;
  const auth = await getClubManager(clubId);
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = body?.action;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  const service = await createServiceClient();

  const { data: req } = await service
    .from("club_group_requests")
    .select(
      "id, club_id, group_id, requested_by, status, club:clubs(name, slug), group:shootout_groups(name, slug, club_id)"
    )
    .eq("id", requestId)
    .eq("club_id", clubId)
    .maybeSingle();
  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (req.status !== "pending") {
    return NextResponse.json(
      { error: `Request already ${req.status}` },
      { status: 409 }
    );
  }

  const club = (req as unknown as { club: { name: string; slug: string } | null }).club;
  const group = (req as unknown as {
    group: { name: string; slug: string; club_id: string | null } | null;
  }).group;
  if (!club || !group) {
    return NextResponse.json({ error: "Club or group missing" }, { status: 404 });
  }

  if (action === "approve") {
    // Refuse if the group has since been attached to a different club.
    // Without this guard, approval would silently overwrite the new
    // attachment — bad surprise.
    if (group.club_id && group.club_id !== clubId) {
      return NextResponse.json(
        { error: "Group is already attached to a different club." },
        { status: 409 }
      );
    }
    if (!group.club_id) {
      const { error: attachErr } = await service
        .from("shootout_groups")
        .update({ club_id: clubId })
        .eq("id", req.group_id);
      if (attachErr) {
        return NextResponse.json({ error: attachErr.message }, { status: 500 });
      }
    }
  }

  const { error: reviewErr } = await service
    .from("club_group_requests")
    .update({
      status: action === "approve" ? "approved" : "rejected",
      reviewed_by: auth.profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (reviewErr) {
    return NextResponse.json({ error: reviewErr.message }, { status: 500 });
  }

  if (req.requested_by) {
    const isApprove = action === "approve";
    await notify({
      profileId: req.requested_by,
      type: isApprove ? "club_group_request_approved" : "club_group_request_rejected",
      title: isApprove
        ? `Approved: ${group.name} is now part of ${club.name}`
        : `Declined: ${group.name} request to ${club.name}`,
      body: isApprove
        ? `${group.name} is now visible under ${club.name}.`
        : `${club.name} declined the attach request. Your group is still active as a standalone.`,
      link: `/groups/${group.slug}`,
      emailTemplate: "ClubGroupRequest",
      emailData: {
        kind: isApprove ? "approved" : "rejected",
        clubName: club.name,
        clubSlug: club.slug,
        groupName: group.name,
        groupSlug: group.slug,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
