/**
 * POST /api/clubs/[id]/join
 *
 * Self-serve membership. Public clubs allow any signed-in user to
 * join; private clubs require a valid invite token (?token=…) that
 * matches a row in club_invites.
 *
 * If the user is already a member: no-op success (idempotent).
 */
import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { id: clubId } = await params;

  const service = await createServiceClient();
  const { data: club } = await service
    .from("clubs")
    .select("id, visibility, is_active")
    .eq("id", clubId)
    .maybeSingle();
  if (!club || !club.is_active) {
    return NextResponse.json({ error: "Club not found" }, { status: 404 });
  }

  if (club.visibility === "private") {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) {
      return NextResponse.json(
        { error: "This club is private. A valid invite is required." },
        { status: 403 }
      );
    }
    const { data: invite } = await service
      .from("club_invites")
      .select("club_id")
      .eq("token", token)
      .eq("club_id", clubId)
      .maybeSingle();
    if (!invite) {
      return NextResponse.json(
        { error: "Invite link is invalid or has been revoked." },
        { status: 403 }
      );
    }
  }

  // Upsert: idempotent rejoin. New members default to club_role='member';
  // never demote an existing admin who re-joins.
  const { error } = await service
    .from("club_memberships")
    .upsert(
      {
        club_id: clubId,
        profile_id: auth.profile.id,
        club_role: "member",
      },
      { onConflict: "club_id,profile_id", ignoreDuplicates: true }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
