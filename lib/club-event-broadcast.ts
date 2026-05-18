/**
 * Shared broadcaster for club-event push/email notifications.
 *
 * Extracted from the route handlers because Next.js's App Router
 * forbids non-method exports from `route.ts` files. Lives next to
 * the routes that call it so the kind/email/payload contract is
 * obvious at the call site.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { notifyMany } from "@/lib/notify";
import { formatDateInZone, formatTimeInZone } from "@/lib/utils";

export async function broadcastEvent({
  kind,
  clubId,
  clubName,
  clubSlug,
  title,
  description,
  eventAt,
  timezone,
  location,
  cancellationMessage,
}: {
  kind: "created" | "updated" | "cancelled";
  clubId: string;
  clubName: string;
  clubSlug: string;
  title: string;
  description?: string | null;
  eventAt: string;
  timezone: string;
  location?: string | null;
  cancellationMessage?: string | null;
}) {
  const service = await createServiceClient();
  const { data: members } = await service
    .from("club_memberships")
    .select("profile_id")
    .eq("club_id", clubId);
  const ids = (members ?? []).map((m: { profile_id: string }) => m.profile_id);
  if (ids.length === 0) return;

  const dateLabel = formatDateInZone(eventAt, timezone);
  const timeLabel = formatTimeInZone(eventAt, timezone);
  const whenLine = `${dateLabel} at ${timeLabel}`;
  const headlinePrefix =
    kind === "created" ? "New event" : kind === "updated" ? "Event updated" : "Event cancelled";
  const pushBody = `${whenLine}${location ? ` · ${location}` : ""}`;

  await notifyMany(ids, {
    type:
      kind === "created"
        ? "club_event_created"
        : kind === "updated"
          ? "club_event_updated"
          : "club_event_cancelled",
    title: `${headlinePrefix}: ${title}`,
    body: pushBody,
    link: `/clubs/${clubSlug}`,
    emailTemplate: "ClubEventInvite",
    emailData: {
      clubName,
      clubSlug,
      eventTitle: title,
      whenLine,
      location: location ?? undefined,
      description: description ?? undefined,
      kind,
      cancellationMessage: cancellationMessage ?? undefined,
    },
  });
}
