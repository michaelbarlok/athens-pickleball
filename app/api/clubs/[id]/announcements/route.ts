/**
 * POST /api/clubs/[id]/announcements  — broadcast a club announcement
 *
 * Auth: club admin / site admin.
 * Body: { title, message }
 *
 * Persists a `club_announcements` row and fans out via notifyMany
 * (in-app + push + email per recipient channel prefs). Mirrors the
 * existing /api/groups/[id]/broadcast pattern.
 */
import { getClubManager } from "@/lib/club-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyMany } from "@/lib/notify";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clubId } = await params;
  const auth = await getClubManager(clubId);
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";

  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });

  const service = await createServiceClient();
  const { data: club } = await service
    .from("clubs")
    .select("name, slug")
    .eq("id", clubId)
    .maybeSingle();
  if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 });

  const { data: announcement, error: insertErr } = await service
    .from("club_announcements")
    .insert({ club_id: clubId, sent_by: auth.profile.id, title, body: message })
    .select("id")
    .single();
  if (insertErr || !announcement) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Failed to record announcement" },
      { status: 500 }
    );
  }

  const { data: members } = await service
    .from("club_memberships")
    .select("profile_id")
    .eq("club_id", clubId);
  const ids = (members ?? []).map((m: { profile_id: string }) => m.profile_id);
  if (ids.length === 0) {
    return NextResponse.json({ sent: 0, announcementId: announcement.id });
  }

  await notifyMany(ids, {
    type: "club_announcement",
    title,
    body: message,
    link: `/clubs/${club.slug}`,
    emailTemplate: "ClubAnnouncement",
    emailData: {
      clubName: club.name,
      clubSlug: club.slug,
      title,
      message,
    },
  });

  return NextResponse.json({ sent: ids.length, announcementId: announcement.id });
}
