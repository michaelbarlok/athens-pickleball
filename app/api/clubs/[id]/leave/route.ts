/**
 * POST /api/clubs/[id]/leave
 *
 * Self-service exit. Removes the caller's club_memberships row.
 * If the caller is the last admin, refuses — there must always be
 * at least one admin per club; a site admin can clean up an
 * orphan-admin club via /admin/clubs.
 */
import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { id: clubId } = await params;

  const service = await createServiceClient();
  const { data: me } = await service
    .from("club_memberships")
    .select("club_role")
    .eq("club_id", clubId)
    .eq("profile_id", auth.profile.id)
    .maybeSingle();
  if (!me) return NextResponse.json({ ok: true }); // already not a member

  if (me.club_role === "admin") {
    const { count } = await service
      .from("club_memberships")
      .select("profile_id", { count: "exact", head: true })
      .eq("club_id", clubId)
      .eq("club_role", "admin");
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        {
          error:
            "You're the last admin of this club. Promote another member to admin before leaving, or contact a site admin.",
        },
        { status: 409 }
      );
    }
  }

  const { error } = await service
    .from("club_memberships")
    .delete()
    .eq("club_id", clubId)
    .eq("profile_id", auth.profile.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
