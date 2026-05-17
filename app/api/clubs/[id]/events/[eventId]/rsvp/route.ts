/**
 * POST   /api/clubs/[id]/events/[eventId]/rsvp  — upsert my RSVP
 * DELETE /api/clubs/[id]/events/[eventId]/rsvp  — clear my RSVP
 *
 * Auth:
 *   - Public club: any signed-in user may RSVP.
 *   - Private club: only club members may RSVP.
 *
 * Body (POST): { status: 'yes'|'no'|'maybe', guest_count?, note? }
 *
 * Capacity enforcement: when the event has a non-null capacity and
 * the request is `status='yes'`, we count the existing yes commitments
 * (yes-count + sum(guest_count where status='yes'), excluding any
 * previous row for this profile being upserted) and reject if the new
 * commitment would push past the cap.
 */
import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: clubId, eventId } = await params;
  const body = await request.json().catch(() => ({}));
  const status = body.status;
  if (!["yes", "no", "maybe"].includes(status)) {
    return NextResponse.json({ error: "status must be yes|no|maybe" }, { status: 400 });
  }
  const guestCount =
    typeof body.guest_count === "number" && Number.isFinite(body.guest_count) && body.guest_count >= 0
      ? Math.floor(body.guest_count)
      : 0;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;

  const service = await createServiceClient();

  // Visibility / membership gate.
  const { data: club } = await service
    .from("clubs")
    .select("visibility")
    .eq("id", clubId)
    .maybeSingle();
  if (!club) return NextResponse.json({ error: "Club not found" }, { status: 404 });

  if (club.visibility === "private" && auth.profile.role !== "admin") {
    const { data: membership } = await service
      .from("club_memberships")
      .select("profile_id")
      .eq("club_id", clubId)
      .eq("profile_id", auth.profile.id)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: "Members only" }, { status: 403 });
    }
  }

  const { data: event } = await service
    .from("club_events")
    .select("capacity, allow_guests, is_cancelled, club_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!event || event.club_id !== clubId) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (event.is_cancelled) {
    return NextResponse.json({ error: "Event is cancelled" }, { status: 409 });
  }

  const guests = event.allow_guests ? guestCount : 0;

  // Capacity check (only for yes commitments and when capacity is set).
  if (status === "yes" && event.capacity !== null) {
    const { data: existingYes } = await service
      .from("club_event_rsvps")
      .select("profile_id, guest_count")
      .eq("event_id", eventId)
      .eq("status", "yes");
    const committed = (existingYes ?? [])
      .filter((r) => r.profile_id !== auth.profile.id)
      .reduce((sum, r) => sum + 1 + (r.guest_count ?? 0), 0);
    const newCommit = 1 + guests;
    if (committed + newCommit > event.capacity) {
      return NextResponse.json(
        { error: `Event is full (${event.capacity} spots). Try maybe or no.` },
        { status: 409 }
      );
    }
  }

  const { error } = await service.from("club_event_rsvps").upsert(
    {
      event_id: eventId,
      profile_id: auth.profile.id,
      status,
      guest_count: guests,
      note,
      responded_at: new Date().toISOString(),
    },
    { onConflict: "event_id,profile_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { eventId } = await params;
  const service = await createServiceClient();
  const { error } = await service
    .from("club_event_rsvps")
    .delete()
    .eq("event_id", eventId)
    .eq("profile_id", auth.profile.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
