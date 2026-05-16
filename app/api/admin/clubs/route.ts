/**
 * POST /api/admin/clubs
 *
 * Site-admin-only: create a new club. The creator is automatically
 * inserted as the first club admin via club_memberships so the new
 * club isn't immediately admin-orphaned.
 *
 * Body: { name, slug?, description?, city?, state?, visibility }
 */
import { requireAdmin } from "@/lib/auth";
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
  const auth = await requireAdmin();
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
    // Unique-slug collision is the most likely failure — surface a
    // clear message so the site admin can pick a different one.
    const msg = /unique|duplicate/i.test(error.message)
      ? "A club with that name (or URL slug) already exists. Try a different name."
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // First club admin = creator. Without this row the creator would
  // immediately lose write access on their own club (site-admin role
  // is unaffected, but a non-site-admin creator would be locked out).
  await service.from("club_memberships").insert({
    club_id: club.id,
    profile_id: auth.profile.id,
    club_role: "admin",
  });

  return NextResponse.json({ id: club.id, slug: club.slug }, { status: 201 });
}
