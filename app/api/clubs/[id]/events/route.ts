/**
 * POST /api/clubs/[id]/events  — create a club event
 *
 * Auth: club admin / site admin.
 * Body: { title, description?, event_at (ISO), end_at? (ISO), timezone?,
 *         location?, capacity?, allow_guests?, fee_cents?, notify? }
 *
 * When `notify: true` is supplied we broadcast a `club_event_created`
 * push + email to every current club member via notifyMany. RSVP is
 * always done from the club page — the notification just deep-links
 * there.
 */
import { getClubManager } from "@/lib/club-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { broadcastEvent } from "@/lib/club-event-broadcast";
import { DEFAULT_TZ } from "@/lib/utils";
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
  const description =
    typeof body.description === "string" ? body.description.trim().slice(0, 4000) || null : null;
  const eventAt = typeof body.event_at === "string" ? body.event_at : "";
  const endAt = typeof body.end_at === "string" && body.end_at ? body.end_at : null;
  const timezone = typeof body.timezone === "string" && body.timezone ? body.timezone : DEFAULT_TZ;
  const location = typeof body.location === "string" ? body.location.trim().slice(0, 300) || null : null;
  const capacity =
    typeof body.capacity === "number" && Number.isFinite(body.capacity) && body.capacity > 0
      ? Math.floor(body.capacity)
      : null;
  const allowGuests = body.allow_guests === true;
  const feeCents =
    typeof body.fee_cents === "number" && Number.isFinite(body.fee_cents) && body.fee_cents >= 0
      ? Math.floor(body.fee_cents)
      : null;
  const shouldNotify = body.notify === true;

  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!eventAt || Number.isNaN(Date.parse(eventAt))) {
    return NextResponse.json({ error: "Valid event_at (ISO datetime) required" }, { status: 400 });
  }
  if (endAt && Number.isNaN(Date.parse(endAt))) {
    return NextResponse.json({ error: "Invalid end_at" }, { status: 400 });
  }

  const service = await createServiceClient();

  const { data: club } = await service
    .from("clubs")
    .select("id, name, slug")
    .eq("id", clubId)
    .maybeSingle();
  if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 });

  const { data: event, error } = await service
    .from("club_events")
    .insert({
      club_id: clubId,
      title,
      description,
      event_at: eventAt,
      end_at: endAt,
      timezone,
      location,
      capacity,
      allow_guests: allowGuests,
      fee_cents: feeCents,
      created_by: auth.profile.id,
    })
    .select("id")
    .single();

  if (error || !event) {
    return NextResponse.json({ error: error?.message ?? "Failed to create event" }, { status: 500 });
  }

  if (shouldNotify) {
    await broadcastEvent({
      kind: "created",
      clubId,
      clubName: club.name,
      clubSlug: club.slug,
      title,
      description,
      eventAt,
      timezone,
      location,
    });
  }

  return NextResponse.json({ id: event.id });
}
