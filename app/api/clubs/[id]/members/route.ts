/**
 * PUT    /api/clubs/[id]/members  — change role, body: { profileId, role }
 * DELETE /api/clubs/[id]/members  — remove member, body: { profileId }
 *
 * Auth: club admin / site admin.
 *
 * Refuses to demote / remove the last admin (same invariant the
 * /leave endpoint enforces).
 */
import { getClubManager } from "@/lib/club-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

async function lastAdminGuard(service: Awaited<ReturnType<typeof createServiceClient>>, clubId: string, targetProfileId: string) {
  const { data: target } = await service
    .from("club_memberships")
    .select("club_role")
    .eq("club_id", clubId)
    .eq("profile_id", targetProfileId)
    .maybeSingle();
  if (!target || target.club_role !== "admin") return null;
  const { count } = await service
    .from("club_memberships")
    .select("profile_id", { count: "exact", head: true })
    .eq("club_id", clubId)
    .eq("club_role", "admin");
  if ((count ?? 0) <= 1) {
    return "Refusing to demote the last admin. Promote another member to admin first.";
  }
  return null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clubId } = await params;
  const auth = await getClubManager(clubId);
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { profileId, role } = await request.json().catch(() => ({}));
  if (!profileId || !["admin", "member"].includes(role)) {
    return NextResponse.json({ error: "profileId + role ('admin'|'member') required" }, { status: 400 });
  }

  const service = await createServiceClient();

  if (role === "member") {
    const err = await lastAdminGuard(service, clubId, profileId);
    if (err) return NextResponse.json({ error: err }, { status: 409 });
  }

  const { error } = await service
    .from("club_memberships")
    .update({ club_role: role })
    .eq("club_id", clubId)
    .eq("profile_id", profileId);
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

  const { profileId } = await request.json().catch(() => ({}));
  if (!profileId) {
    return NextResponse.json({ error: "profileId required" }, { status: 400 });
  }

  const service = await createServiceClient();
  const err = await lastAdminGuard(service, clubId, profileId);
  if (err) return NextResponse.json({ error: err }, { status: 409 });

  const { error } = await service
    .from("club_memberships")
    .delete()
    .eq("club_id", clubId)
    .eq("profile_id", profileId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
