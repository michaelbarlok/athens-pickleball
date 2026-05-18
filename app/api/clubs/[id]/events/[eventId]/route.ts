/**
 * PUT    /api/clubs/[id]/events/[eventId]  — edit event
 * DELETE /api/clubs/[id]/events/[eventId]  — soft-cancel (is_cancelled = true)
 *
 * PUT body accepts a partial subset of the editable fields. When the
 * body includes `notify: true` we re-broadcast a `club_event_updated`
 * push + email.
 *
 * DELETE accepts a `cancellation_message` and (when `notify: true`)
 * broadcasts a `club_event_cancelled` push + email.
 *
 * Auth: club admin / site admin.
 */
import { getClubManager } from "@/lib/club-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { broadcastEvent } from "@/lib/club-event-broadcast";

const EDITABLE_FIELDS = new Set([
  "title",
  "description",
  "event_at",
  "end_at",
  "timezone",
  "location",
  "capacity",
  "allow_guests",
  "fee_cents",
]);

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  const { id: clubId, eventId } = await params;
  const auth = await getClubManager(clubId);
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (EDITABLE_FIELDS.has(key)) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields supplied" }, { status: 400 });
  }
  if (typeof updates.title === "string") {
    updates.title = (updates.title as string).trim().slice(0, 200);
    if (!updates.title) return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
  }
  if (typeof updates.event_at === "string" && Number.isNaN(Date.parse(updates.event_at as string))) {
    return NextResponse.json({ error: "Invalid event_at" }, { status: 400 });
  }
  if (typeof updates.end_at === "string" && updates.end_at && Number.isNaN(Date.parse(updates.end_at as string))) {
    return NextResponse.json({ error: "Invalid end_at" }, { status: 400 });
  }

  const service = await createServiceClient();
  const { error } = await service
    .from("club_events")
    .update(updates)
    .eq("id", eventId)
    .eq("club_id", clubId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (body.notify === true) {
    const { data: event } = await service
      .from("club_events")
      .select("title, description, event_at, timezone, location, club:clubs(name, slug)")
      .eq("id", eventId)
      .maybeSingle();
    const club = (event as any)?.club;
    if (event && club) {
      await broadcastEvent({
        kind: "updated",
        clubId,
        clubName: club.name,
        clubSlug: club.slug,
        title: (event as any).title,
        description: (event as any).description,
        eventAt: (event as any).event_at,
        timezone: (event as any).timezone,
        location: (event as any).location,
      });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  const { id: clubId, eventId } = await params;
  const auth = await getClubManager(clubId);
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const cancellationMessage =
    typeof body.cancellation_message === "string"
      ? body.cancellation_message.trim().slice(0, 2000) || null
      : null;

  const service = await createServiceClient();
  const { error } = await service
    .from("club_events")
    .update({ is_cancelled: true, cancellation_message: cancellationMessage })
    .eq("id", eventId)
    .eq("club_id", clubId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (body.notify === true) {
    const { data: event } = await service
      .from("club_events")
      .select("title, event_at, timezone, location, club:clubs(name, slug)")
      .eq("id", eventId)
      .maybeSingle();
    const club = (event as any)?.club;
    if (event && club) {
      await broadcastEvent({
        kind: "cancelled",
        clubId,
        clubName: club.name,
        clubSlug: club.slug,
        title: (event as any).title,
        eventAt: (event as any).event_at,
        timezone: (event as any).timezone,
        location: (event as any).location,
        cancellationMessage,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
