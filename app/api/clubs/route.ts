/**
 * POST /api/clubs
 *
 * Create a club. Any signed-in user can create one — there's no
 * site-admin gate. The creator is auto-inserted into
 * club_memberships with club_role='admin' so the new club isn't
 * immediately admin-orphaned.
 *
 * Body: { name, slug?, description?, city?, state?, visibility }
 *
 * (The PUT/DELETE for an existing club live in
 *  /api/clubs/[id]/route.ts and have their own auth gates.)
 */
import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const slug = (body.slug ? slugify(body.slug) : slugify(name)) || `club-${Date.now()}`;
  const visibility = body.visibility === "private" ? "private" : "public";

  const service = await createServiceClient();

  const { data: club, error } = await service
    .from("clubs")
    .insert({
      name,
      slug,
      description: body.description?.trim() || null,
      city: body.city?.trim() || null,
      state: body.state?.trim() || null,
      visibility,
      created_by: auth.profile.id,
    })
    .select("id, slug")
    .single();

  if (error) {
    const msg = /unique|duplicate/i.test(error.message)
      ? "A club with that name (or URL slug) already exists. Try a different name."
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Creator becomes the first admin. Without this row, a non-site-admin
  // creator would lose write access on their own club the moment they
  // navigate away from the create flow.
  await service.from("club_memberships").insert({
    club_id: club.id,
    profile_id: auth.profile.id,
    club_role: "admin",
  });

  return NextResponse.json({ id: club.id, slug: club.slug }, { status: 201 });
}
