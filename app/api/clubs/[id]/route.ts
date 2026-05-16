/**
 * GET    /api/clubs/[id]       — anyone (subject to RLS)
 * PUT    /api/clubs/[id]       — club admin / site admin
 * DELETE /api/clubs/[id]       — site admin only
 *
 * The PUT body is a partial set of editable fields:
 *   name, slug, description, city, state, visibility, logo_url
 *
 * is_active stays separate (the management page surfaces a
 * "deactivate" toggle that flips it via the same endpoint).
 */
import { getClubManager } from "@/lib/club-auth";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const EDITABLE_FIELDS = new Set([
  "name",
  "slug",
  "description",
  "city",
  "state",
  "visibility",
  "logo_url",
  "is_active",
]);

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clubId } = await params;
  const auth = await getClubManager(clubId);
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (EDITABLE_FIELDS.has(key)) updates[key] = body[key];
  }
  if (typeof updates.visibility === "string" && !["public", "private"].includes(updates.visibility as string)) {
    return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields supplied" }, { status: 400 });
  }

  const service = await createServiceClient();
  const { error } = await service.from("clubs").update(updates).eq("id", clubId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Site-admin-only — deleting a club orphans every constituent
  // group back to standalone (ON DELETE SET NULL) and removes
  // club_memberships + club_invites (CASCADE). Group data inside
  // each constituent group is untouched.
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id: clubId } = await params;
  const service = await createServiceClient();
  const { error } = await service.from("clubs").delete().eq("id", clubId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
