import { requireAdmin } from "@/lib/auth";
import { notify, fetchNotifyProfiles } from "@/lib/notify";
import { createServiceClient } from "@/lib/supabase/server";
import { getDivisionLabel } from "@/lib/divisions";
import { isTestUser } from "@/lib/utils";
import { EMAIL_PUBLIC_URL } from "@/lib/email-urls";
import { NextRequest, NextResponse } from "next/server";

const FORMAT_LABELS: Record<string, string> = {
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
  round_robin: "Round Robin",
};

const TYPE_LABELS: Record<string, string> = {
  singles: "Singles",
  doubles: "Doubles",
};

const THROTTLE_MS = 60 * 60 * 1000; // 1 hour per tournament

function formatDateLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  // ISO date-only strings (YYYY-MM-DD) get parsed in UTC and then
  // formatted in the server zone, which can shift the date a day.
  // Append T12:00:00 to anchor mid-day so the date is stable.
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTimeLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatTimeLabel(time: string | null | undefined): string | null {
  if (!time) return null;
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  if (isNaN(hour)) return null;
  const suffix = hour >= 12 ? "pm" : "am";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m ?? "00"} ${suffix}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;

  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const customMessage =
    typeof body.customMessage === "string"
      ? body.customMessage.trim().slice(0, 1000)
      : "";
  // Test mode restricts the broadcast to active site admins (today
  // that's Michael + Addison). Lets the calling admin preview the
  // delivered email without spamming the membership. Skips the
  // hour-throttle and doesn't stamp last_announced_at, so a real
  // broadcast can still go out immediately afterwards.
  const testMode = body.testMode === true;

  // Fetch tournament. Use the service client so a future RLS tightening
  // on tournaments doesn't silently empty the broadcast — site admin
  // is already verified above.
  const serviceClient = await createServiceClient();
  const { data: tournament, error: tErr } = await serviceClient
    .from("tournaments")
    .select(
      "id, title, status, is_hidden, start_date, start_time, location, format, type, divisions, registration_opens_at, registration_closes_at, entry_fee, payment_options, logo_url, last_announced_at"
    )
    .eq("id", tournamentId)
    .maybeSingle();

  if (tErr || !tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  if (tournament.is_hidden) {
    return NextResponse.json(
      { error: "Hidden tournaments can't be broadcast — unhide first." },
      { status: 400 }
    );
  }
  if (tournament.status === "cancelled") {
    return NextResponse.json(
      { error: "Cancelled tournaments can't be broadcast." },
      { status: 400 }
    );
  }

  // Throttle: at most one broadcast per tournament per hour. Prevents
  // a misclick or a confused page reload from double-blasting members.
  // Test sends are always allowed — they only reach admins.
  if (!testMode && tournament.last_announced_at) {
    const last = new Date(tournament.last_announced_at).getTime();
    const elapsed = Date.now() - last;
    if (elapsed < THROTTLE_MS) {
      const minutesLeft = Math.ceil((THROTTLE_MS - elapsed) / 60000);
      return NextResponse.json(
        {
          error: `Already sent in the last hour — try again in ${minutesLeft} minute${
            minutesLeft === 1 ? "" : "s"
          }.`,
        },
        { status: 429 }
      );
    }
  }

  // Recipients: every active profile, minus test users, minus
  // anyone who's explicitly turned tournament_announcement off in
  // their per-type prefs. Pre-filtering opt-outs at the route
  // saves the per-recipient profile fetch + insert that notify()
  // would have done before bailing on the empty channel set.
  // In test mode, narrow to active site admins so admins can
  // preview the actual delivered email before broadcasting.
  let profilesQuery = serviceClient
    .from("profiles")
    .select("id, email, display_name, notification_preferences")
    .eq("is_active", true);
  if (testMode) profilesQuery = profilesQuery.eq("role", "admin");
  const { data: profiles, error: pErr } = await profilesQuery;

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const recipients = (profiles ?? []).filter((p) => {
    if (isTestUser(p.email, p.display_name)) return false;
    // Read the per-type pref for tournament_announcement. Both the
    // new array shape (["email","push"]) and the legacy string
    // shape ("off"|"email"|"push") are handled — match the
    // resolution in notify().
    const prefs =
      (p.notification_preferences as Record<string, unknown> | null) ?? null;
    const v = prefs?.tournament_announcement;
    if (Array.isArray(v) && v.length === 0) return false;
    if (typeof v === "string" && v === "off") return false;
    return true;
  });
  const recipientIds = recipients.map((p) => p.id);

  if (recipientIds.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  // Build the email-template payload once; notifyMany passes the same
  // emailData to every recipient (the per-recipient profile-id
  // unsubscribe link is added inside the helper).
  const divisionLabels = (tournament.divisions ?? []).map((code: string) =>
    getDivisionLabel(code)
  );

  // Build a plain-text alternative for the email client + Gmail's
  // classifier. HTML-only emails skew Promotions; sending a real
  // text part alongside the React HTML keeps us looking transactional.
  const tournamentUrl = `${EMAIL_PUBLIC_URL}/tournaments/${tournament.id}`;
  const detailLines: string[] = [];
  if (tournament.start_date) {
    detailLines.push(`When: ${formatDateLabel(tournament.start_date) ?? tournament.start_date}${tournament.start_time ? ` · ${formatTimeLabel(tournament.start_time)}` : ""}`);
  }
  if (tournament.location) detailLines.push(`Where: ${tournament.location}`);
  detailLines.push(
    `Format: ${FORMAT_LABELS[tournament.format] ?? tournament.format} · ${TYPE_LABELS[tournament.type] ?? tournament.type}`
  );
  if (divisionLabels.length > 0) detailLines.push(`Divisions: ${divisionLabels.join(", ")}`);
  const regOpens = formatDateTimeLabel(tournament.registration_opens_at);
  const regCloses = formatDateTimeLabel(tournament.registration_closes_at);
  if (regOpens || regCloses) {
    detailLines.push(
      `Registration: ${[regOpens ? `opens ${regOpens}` : null, regCloses ? `closes ${regCloses}` : null].filter(Boolean).join(" · ")}`
    );
  }
  if (tournament.entry_fee && tournament.entry_fee > 0) {
    detailLines.push(`Entry fee: $${tournament.entry_fee} per team`);
  }
  const bodyText = [
    customMessage,
    customMessage ? "" : null,
    tournament.title,
    "",
    detailLines.join("\n"),
    "",
    `Register: ${tournamentUrl}`,
    "",
    "—",
    "You can turn off Nearby tournament notifications from your profile:",
    `${EMAIL_PUBLIC_URL}/profile/notifications`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const baseEmailData = {
    customMessage,
    tournamentTitle: tournament.title,
    tournamentId: tournament.id,
    tournamentLogoUrl: tournament.logo_url ?? null,
    startDateLabel: formatDateLabel(tournament.start_date),
    startTimeLabel: formatTimeLabel(tournament.start_time),
    location: tournament.location,
    formatLabel: FORMAT_LABELS[tournament.format] ?? tournament.format,
    typeLabel: TYPE_LABELS[tournament.type] ?? tournament.type,
    divisionLabels,
    registrationOpensLabel: formatDateTimeLabel(tournament.registration_opens_at),
    registrationClosesLabel: formatDateTimeLabel(tournament.registration_closes_at),
    entryFee: tournament.entry_fee ?? null,
    paymentOptions: tournament.payment_options ?? [],
    // Picked up by sendEmail() and forwarded to Resend's `text` field.
    bodyText,
  };

  const inAppTitle = `New tournament: ${tournament.title}`;
  const inAppBody = customMessage
    ? customMessage
    : `Registration is open. Tap to view details.`;

  // notifyMany writes per-recipient in-app rows + sends per-channel
  // (email + push if user opted in). The recipient profile id is
  // threaded into emailData inside the helper via a per-call hook
  // below — done by passing recipientProfileId in emailData when we
  // build per-recipient calls. For a flat broadcast we re-use the
  // bulk helper but augment its closure: notifyMany doesn't currently
  // do per-recipient template data, so we run notify directly per
  // recipient in batches the same way notifyMany does to inject the
  // unsubscribe profile id into each email.
  await notifyManyWithRecipientId(recipients, {
    type: "tournament_announcement",
    title: inAppTitle,
    body: inAppBody,
    link: `/tournaments/${tournament.id}`,
    emailTemplate: "TournamentAnnouncement",
    emailData: baseEmailData,
  });

  // Stamp last_announced_at so the throttle window starts now —
  // skipped for test sends so a real broadcast can still go out
  // immediately afterwards.
  if (!testMode) {
    await serviceClient
      .from("tournaments")
      .update({ last_announced_at: new Date().toISOString() })
      .eq("id", tournament.id);
  }

  return NextResponse.json({ sent: recipientIds.length, testMode });
}

/**
 * Per-recipient send that injects each recipient's profile id into
 * their email's unsubscribe deep link. Mirrors notifyMany's batching
 * (size 10 with a 200ms gap) so we stay under Resend rate limits.
 */
async function notifyManyWithRecipientId(
  recipients: { id: string }[],
  base: {
    type: "tournament_announcement";
    title: string;
    body: string;
    link?: string;
    emailTemplate: string;
    emailData: Record<string, unknown>;
  }
): Promise<void> {
  const BATCH_SIZE = 10;

  // Pre-fetch every recipient's profile in a single SELECT instead
  // of letting notify() hit the DB per recipient. notifyMany() does
  // the same — we duplicate that pattern here because this loop
  // injects per-recipient emailData (recipientProfileId) which the
  // standard notifyMany() doesn't support.
  const profileMap = await fetchNotifyProfiles(recipients.map((r) => r.id));

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map((r) =>
        notify({
          profileId: r.id,
          type: base.type,
          title: base.title,
          body: base.body,
          link: base.link,
          emailTemplate: base.emailTemplate,
          emailData: { ...base.emailData, recipientProfileId: r.id },
          prefetchedProfile: profileMap.get(r.id),
        })
      )
    );
    if (i + BATCH_SIZE < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

/**
 * GET — small helper so the modal can show "This will be sent to N
 * members" without having to re-fetch the recipient pool from the
 * client. Site-admin only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;

  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const serviceClient = await createServiceClient();
  // Mirror the POST handler's filter set so the modal's "This will
  // email N members" line matches the count POST will actually send.
  const { data: profiles } = await serviceClient
    .from("profiles")
    .select("email, display_name, notification_preferences")
    .eq("is_active", true);

  const count = (profiles ?? []).filter((p) => {
    if (isTestUser(p.email, p.display_name)) return false;
    const prefs =
      (p.notification_preferences as Record<string, unknown> | null) ?? null;
    const v = prefs?.tournament_announcement;
    if (Array.isArray(v) && v.length === 0) return false;
    if (typeof v === "string" && v === "off") return false;
    return true;
  }).length;

  const { data: t } = await serviceClient
    .from("tournaments")
    .select("last_announced_at")
    .eq("id", tournamentId)
    .maybeSingle();

  const lastAnnouncedAt = t?.last_announced_at ?? null;
  const cooldownRemainingMs = lastAnnouncedAt
    ? Math.max(
        0,
        THROTTLE_MS - (Date.now() - new Date(lastAnnouncedAt).getTime())
      )
    : 0;

  return NextResponse.json({
    recipientCount: count,
    lastAnnouncedAt,
    cooldownRemainingMs,
  });
}
