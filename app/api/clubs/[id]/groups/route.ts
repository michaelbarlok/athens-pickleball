/**
 * POST   /api/clubs/[id]/groups   — attach a group to this club
 * DELETE /api/clubs/[id]/groups   — detach a group (set club_id NULL)
 *
 * Body: { groupId: string }
 *
 * Auth: club admin / site admin.
 *
 * Attaching a group ONLY sets shootout_groups.club_id. No rows in
 * group_memberships are touched, no rankings are modified, no
 * existing data is rewritten — the group keeps all of its members,
 * sheets, sessions, scores, and the same group admins. The only
 * effect is that club admins now inherit group admin rights on this
 * group (via lib/auth.ts isGroupAdmin), and the group appears on
 * the club's public page.
 */
import { getClubManager } from "@/lib/club-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clubId } = await params;
  const auth = await getClubManager(clubId);
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const groupId = (body.groupId ?? "").trim();
  if (!groupId) {
    return NextResponse.json({ error: "groupId required" }, { status: 400 });
  }

  const service = await createServiceClient();

  // Refuse to attach if the group already belongs to a different
  // club — admins should detach from the current club first, so
  // there's no silent ownership transfer.
  const { data: group } = await service
    .from("shootout_groups")
    .select("club_id, name")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  if (group.club_id && group.club_id !== clubId) {
    return NextResponse.json(
      {
        error:
          "That group is already attached to another club. Detach it from its current club first.",
      },
      { status: 409 }
    );
  }

  const { error } = await service
    .from("shootout_groups")
    .update({ club_id: clubId })
    .eq("id", groupId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clubId } = await params;
  const auth = await getClubManager(clubId);
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const groupId = (body.groupId ?? "").trim();
  if (!groupId) {
    return NextResponse.json({ error: "groupId required" }, { status: 400 });
  }

  const service = await createServiceClient();

  // Only detach if the group is currently attached to THIS club —
  // protects against a stale-tab admin clicking Detach on a group
  // that was already reassigned elsewhere.
  const { error } = await service
    .from("shootout_groups")
    .update({ club_id: null })
    .eq("id", groupId)
    .eq("club_id", clubId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
