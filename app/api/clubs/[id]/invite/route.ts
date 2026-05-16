/**
 * POST /api/clubs/[id]/invite
 *
 * Mints a shareable token for joining a private club, or returns
 * the canonical /clubs/[slug] URL for public clubs (no token needed
 * — public clubs are self-serve). Mirrors /api/groups/[id]/invite
 * behavior so the InviteButton component can share UX.
 *
 * Auth: any club member can create an invite (matches groups).
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

  const body = await request.json().catch(() => ({}));
  const visibility = body.visibility as string | undefined;
  const clubSlug = (body.clubSlug as string | undefined) ?? "";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  // Public club: invite link is just the canonical slug URL.
  if (visibility === "public") {
    return NextResponse.json({ url: `${appUrl}/clubs/${clubSlug}` });
  }

  const service = await createServiceClient();

  // Caller must be a member to mint a token.
  const { data: membership } = await service
    .from("club_memberships")
    .select("profile_id")
    .eq("club_id", clubId)
    .eq("profile_id", auth.profile.id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "Only members can create invites" }, { status: 403 });
  }

  const { data: invite, error } = await service
    .from("club_invites")
    .insert({ club_id: clubId, created_by: auth.profile.id })
    .select("token")
    .single();
  if (error || !invite) {
    return NextResponse.json({ error: error?.message ?? "Failed to create invite" }, { status: 500 });
  }

  return NextResponse.json({
    url: `${appUrl}/clubs/${clubSlug}?token=${invite.token}`,
  });
}
