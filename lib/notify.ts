import type React from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPushNotification } from "@/lib/push";
import { isTestUser } from "@/lib/utils";
import type { NotificationType } from "@/types/database";

/**
 * Notifications that are too time-sensitive to let a user opt out
 * of — tournament live-play pings + ladder/sheet alerts where
 * missing the message means missing the play window. A player who
 * silenced these could miss their court assignment or their
 * withdrawal window and hold the schedule up, so we ignore the
 * per-type "off" switch for this set and fire on whichever of
 * push/email the user has in their global preferences (push
 * preferred when a subscription exists, email otherwise). In-app
 * rows are always written regardless.
 *
 * Side effect of "required": these always go via push when a
 * subscription is present, which means iOS displays them with our
 * service-worker icon + badge instead of the iOS Mail "first letter
 * of sender" avatar.
 */
const REQUIRED_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set([
  "tournament_division_started",
  "tournament_up_next",
  "tournament_court_assigned",
  "tournament_playoffs_starting",
  "withdraw_closing",
  "signup_reminder",
  "session_starting",
  "pool_assigned",
]);

/**
 * Per-type default channel set. Used when the recipient hasn't
 * explicitly set a per-type pref. Listed types ignore the user's
 * global preferred_notify and fall back to the channels here
 * instead. The user can still override by flipping channels on the
 * per-type row in their profile.
 */
const TYPE_CHANNEL_DEFAULTS: Partial<Record<NotificationType, ("email" | "push")[]>> = {
  tournament_announcement: ["email"],
};

/**
 * Just the profile columns notify() actually reads. Exported so
 * notifyMany (and the per-recipient broadcast loop in the
 * notify-members route) can pre-fetch a Map<profileId, NotifyProfile>
 * via fetchNotifyProfiles() and pass each recipient's row through —
 * cutting N profile SELECTs down to one for the whole batch.
 */
export interface NotifyProfile {
  email: string | null;
  phone: string | null;
  preferred_notify: string[] | null;
  notification_preferences: Record<string, unknown> | null;
  display_name: string;
  /** Set true by the Resend webhook after 3+ bounces. notify() skips
   *  the email channel for these profiles until the flag clears
   *  (auto-clears via DB trigger when the user changes their email). */
  email_bouncing?: boolean | null;
}

interface NotifyParams {
  profileId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  groupId?: string;
  emailTemplate?: string;
  emailData?: Record<string, unknown>;
  /** Pre-fetched profile to skip the per-recipient SELECT. Used by
   *  notifyMany to batch the profile read into a single round trip. */
  prefetchedProfile?: NotifyProfile;
}

/**
 * Batch fetch the profile fields that notify() needs. Keeps the
 * single-row SELECT in notify() as a fallback for callers that don't
 * pass a prefetched profile.
 */
export async function fetchNotifyProfiles(
  profileIds: string[]
): Promise<Map<string, NotifyProfile>> {
  const map = new Map<string, NotifyProfile>();
  if (profileIds.length === 0) return map;
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("profiles")
    .select(
      "id, email, phone, preferred_notify, notification_preferences, display_name, email_bouncing"
    )
    .in("id", profileIds);
  for (const row of data ?? []) {
    map.set((row as { id: string }).id, {
      email: (row as { email: string | null }).email,
      phone: (row as { phone: string | null }).phone,
      preferred_notify: (row as { preferred_notify: string[] | null }).preferred_notify,
      notification_preferences: (row as { notification_preferences: Record<string, unknown> | null })
        .notification_preferences,
      display_name: (row as { display_name: string }).display_name,
      email_bouncing: (row as { email_bouncing: boolean | null }).email_bouncing,
    });
  }
  return map;
}

/**
 * Unified notification helper.
 * 1. Always writes an in-app notification row.
 * 2. Sends email via Resend if user prefers email and template exists.
 * 3. Sends SMS via Twilio if user prefers SMS and has a phone number.
 */
export async function notify({
  profileId,
  type,
  title,
  body,
  link,
  groupId,
  emailTemplate,
  emailData,
  prefetchedProfile,
}: NotifyParams): Promise<void> {
  const supabase = await createServiceClient();

  // 1. Fetch user preferences first so we can respect "off" before writing in-app.
  //    notifyMany pre-fetches every recipient's profile in one bulk
  //    SELECT and passes it through here, so the per-recipient round
  //    trip below only fires for solo notify() callers.
  let profile: NotifyProfile | null = prefetchedProfile ?? null;
  if (!profile) {
    const { data, error: profileErr } = await supabase
      .from("profiles")
      .select(
        "email, phone, preferred_notify, notification_preferences, display_name, email_bouncing"
      )
      .eq("id", profileId)
      .single();
    if (!data) {
      console.error("Profile not found for notification:", profileId, profileErr?.message);
      return;
    }
    profile = data as NotifyProfile;
  }

  const prefs: string[] = profile.preferred_notify ?? ["email"];
  const rawTypePrefs =
    (profile.notification_preferences as Record<string, unknown> | null) ?? {};
  const rawTypePref = rawTypePrefs[type];

  // Per-type prefs: accept both the new array shape (["email","push"]) and
  // the legacy string shape ("email"|"push"|"off") for rows not touched by
  // the 077 backfill. An empty array means "off" for this type.
  const typeChannels: Set<"email" | "push"> | null = (() => {
    if (rawTypePref === undefined || rawTypePref === null) return null;
    if (Array.isArray(rawTypePref)) {
      return new Set(rawTypePref.filter((c): c is "email" | "push" => c === "email" || c === "push"));
    }
    if (typeof rawTypePref === "string") {
      if (rawTypePref === "off") return new Set();
      if (rawTypePref === "email" || rawTypePref === "push") return new Set([rawTypePref]);
    }
    return null;
  })();

  const isRequired = REQUIRED_NOTIFICATION_TYPES.has(type);

  // Required types bypass the per-type opt-out. For anything else,
  // an empty per-type channel list means "off" and we bail.
  if (!isRequired && typeChannels && typeChannels.size === 0) return;

  // 2. Write in-app notification
  try {
    const { error: insertErr } = await supabase.from("notifications").insert({
      user_id: profileId,
      type,
      title,
      body,
      link,
      group_id: groupId ?? null,
    });
    if (insertErr) {
      console.error("Failed to insert notification:", insertErr.message);
    }
  } catch (e) {
    console.error("Notification insert threw:", e);
  }

  // Channel resolution:
  //   - Required: if the viewer has ANY active push subscription
  //     we send push (not email); otherwise we fall back to email.
  //     We intentionally ignore preferred_notify here so a user can't
  //     silence a live-play ping by un-ticking both channels in their
  //     profile.
  //   - Optional: per-type overrides global (existing behaviour).
  let shouldEmail: boolean;
  let shouldPush: boolean;
  if (isRequired) {
    const { count: pushCount } = await supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId);
    const hasPushSub = (pushCount ?? 0) > 0;
    shouldPush = hasPushSub;
    shouldEmail = !hasPushSub;
  } else {
    // Some types default to a narrower channel set than the global
    // preferred_notify list, regardless of what the user has in their
    // global "send me" preferences. tournament_announcement is the
    // first one — it's a marketing-style broadcast, so we default to
    // email-only and let users explicitly opt into push via the
    // per-type pref. This avoids vibrating phones at midnight when
    // an admin hits "Notify Members" and lets users keep push on for
    // their actual tournament-day pings.
    const typeDefault = TYPE_CHANNEL_DEFAULTS[type];
    if (typeChannels) {
      shouldEmail = typeChannels.has("email");
      shouldPush = typeChannels.has("push");
    } else if (typeDefault) {
      shouldEmail = typeDefault.includes("email");
      shouldPush = typeDefault.includes("push");
    } else {
      shouldEmail = prefs.includes("email");
      shouldPush = prefs.includes("push");
    }
  }

  // 3. Fire email, SMS, and push in parallel. Previously these were
  // awaited one after the other, so a push was delayed by however long
  // Resend took (~1-3s) before the browser push service even saw it —
  // users on push-only notifications experienced a 30s+ perceived lag
  // compared to email. Each channel is independent and failures are
  // already handled locally, so there's no reason to serialize.
  // Skip the email channel for known-bouncing addresses. The webhook
  // at /api/webhooks/resend flips email_bouncing=true after 3+ bounces;
  // the trigger on profiles auto-resets the flag when the user updates
  // their email. Push and in-app notifications still fire normally.
  const emailPromise =
    shouldEmail &&
    emailTemplate &&
    profile.email &&
    !profile.email_bouncing &&
    !isTestUser(profile.email, profile.display_name)
      ? sendEmail({
          to: profile.email,
          subject: title,
          template: emailTemplate,
          data: { ...emailData, title, body },
          type,
          bodyText: typeof emailData?.bodyText === "string" ? emailData.bodyText : undefined,
        }).catch((err) => {
          console.error("Failed to send email notification:", err);
        })
      : null;

  const smsPromise =
    prefs.includes("sms") && profile.phone
      ? sendSMS({
          to: profile.phone,
          message: `${title}: ${body}`,
        }).catch((err) => {
          console.error("Failed to send SMS notification:", err);
        })
      : null;

  const pushPromise = shouldPush
    ? sendPushNotification(supabase, profileId, {
        title,
        body,
        link,
        tag: type,
      }).catch((err) => {
        console.error("Failed to send push notification:", err);
      })
    : null;

  await Promise.allSettled([emailPromise, smsPromise, pushPromise].filter((p) => p !== null));
}

/**
 * Send bulk notifications to multiple users.
 *
 * Pre-fetches every recipient's profile in a single SELECT and
 * threads it through to notify() via prefetchedProfile, replacing
 * what used to be N separate per-recipient profile SELECTs (one
 * per call to notify()). On a 200-recipient broadcast that's a
 * 200× round-trip reduction.
 *
 * Still processes the actual sends in batches of 10 with a short
 * delay between batches to avoid overwhelming Resend / Twilio /
 * the browser push service.
 */
export async function notifyMany(
  profileIds: string[],
  params: Omit<NotifyParams, "profileId" | "prefetchedProfile">
): Promise<void> {
  const BATCH_SIZE = 10;
  let totalFailures = 0;

  // One SELECT for the whole broadcast.
  const profileMap = await fetchNotifyProfiles(profileIds);

  for (let i = 0; i < profileIds.length; i += BATCH_SIZE) {
    const batch = profileIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((profileId) =>
        notify({
          ...params,
          profileId,
          prefetchedProfile: profileMap.get(profileId),
        })
      )
    );
    const failures = results.filter((r) => r.status === "rejected");
    totalFailures += failures.length;

    // Delay between batches to respect rate limits (skip after last batch)
    if (i + BATCH_SIZE < profileIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  if (totalFailures > 0) {
    console.error(`notifyMany: ${totalFailures}/${profileIds.length} failed`);
  }
}

// ============================================================
// Email (Resend)
// ============================================================

// Static template map — dynamic import(`@/emails/${name}`) doesn't work
// with Next.js path aliases at runtime, so we map templates explicitly.
const EMAIL_TEMPLATES: Record<string, () => Promise<{ default: (props: any) => React.ReactElement }>> = {
  NewSheet: () => import("@/emails/NewSheet"),
  SheetCancelled: () => import("@/emails/SheetCancelled"),
  SheetUpdated: () => import("@/emails/SheetUpdated"),
  WaitlistPromoted: () => import("@/emails/WaitlistPromoted"),
  BumpedToWaitlist: () => import("@/emails/BumpedToWaitlist"),
  SignupReminder: () => import("@/emails/SignupReminder"),
  WithdrawReminder: () => import("@/emails/WithdrawReminder"),
  SessionStarting: () => import("@/emails/SessionStarting"),
  ContactGroupAdmins: () => import("@/emails/ContactGroupAdmins"),
  MemberInvite: () => import("@/emails/MemberInvite"),
  ForumReply: () => import("@/emails/ForumReply"),
  ForumMention: () => import("@/emails/ForumMention"),
  PoolAssigned: () => import("@/emails/PoolAssigned"),
  StepChanged: () => import("@/emails/StepChanged"),
  TournamentWaitlistPromoted: () => import("@/emails/TournamentWaitlistPromoted"),
  TournamentRegistered: () => import("@/emails/TournamentRegistered"),
  TournamentWithdrawal: () => import("@/emails/TournamentWithdrawal"),
  BadgeEarned: () => import("@/emails/BadgeEarned"),
  SessionRecap: () => import("@/emails/SessionRecap"),
  FreePlayRecap: () => import("@/emails/FreePlayRecap"),
  GroupAnnouncement: () => import("@/emails/GroupAnnouncement"),
  TournamentRecap: () => import("@/emails/TournamentRecap"),
  TournamentAlert: () => import("@/emails/TournamentAlert"),
  TournamentPartnerRequest: () => import("@/emails/TournamentPartnerRequest"),
  TournamentPartnerAccepted: () => import("@/emails/TournamentPartnerAccepted"),
  TournamentPartnerDeclined: () => import("@/emails/TournamentPartnerDeclined"),
  TournamentAnnouncement: () => import("@/emails/TournamentAnnouncement"),
  ClubAnnouncement: () => import("@/emails/ClubAnnouncement"),
  ClubEventInvite: () => import("@/emails/ClubEventInvite"),
};

/**
 * Notification types we treat as "bulk" sends (one-to-many, not
 * triggered by the recipient's own action). These get an extra
 * `Precedence: bulk` header on top of the universal List-Unsubscribe
 * + Reply-To so Gmail's classifier has a clear "real bulk sender"
 * signal instead of treating them as marketing.
 */
const BULK_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set([
  "tournament_announcement",
  "group_announcement",
  "club_announcement",
  "club_event_created",
  "club_event_updated",
  "club_event_cancelled",
]);

async function sendEmail({
  to,
  subject,
  template,
  data,
  type,
  bodyText,
}: {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
  type: NotificationType;
  /** Optional plain-text alternative. Sent alongside the React/HTML
   *  version so non-HTML clients (and Gmail's classifier) see real
   *  text content, which improves deliverability. */
  bodyText?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set, skipping email");
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const loader = EMAIL_TEMPLATES[template];
  if (!loader) {
    console.warn(`Email template not found: ${template}`);
    return;
  }

  const emailComponent = (await loader()).default;

  // Headers that improve inbox placement (especially for Gmail's
  // Promotions-vs-Primary classifier):
  //   * List-Unsubscribe + List-Unsubscribe-Post — RFC 2369 / 8058.
  //     Without this Gmail treats the message as ambiguous bulk and
  //     leans Promotions. Both a mailto and an https form are
  //     included; https points at the existing notifications-prefs
  //     redirect so the user lands on their per-type opt-out row.
  //   * Reply-To — replies stay in the same thread the user reads,
  //     and a "real" reply path is a strong Primary signal.
  //   * Precedence: bulk — for our few one-to-many sends. Tells
  //     well-behaved autoresponders to not bounce vacation replies
  //     back at the inbox.
  const { EMAIL_PUBLIC_URL } = await import("@/lib/email-urls");
  const headers: Record<string, string> = {
    "List-Unsubscribe": `<mailto:info@tristarpickleball.com?subject=Unsubscribe>, <${EMAIL_PUBLIC_URL}/profile/notifications>`,
  };
  if (BULK_NOTIFICATION_TYPES.has(type)) {
    headers["Precedence"] = "bulk";
  }

  await resend.emails.send({
    from: "Tri-Star Pickleball <info@tristarpickleball.com>",
    to,
    replyTo: "info@tristarpickleball.com",
    subject,
    react: emailComponent(data),
    text: bodyText,
    headers,
  });
}

// ============================================================
// SMS (Twilio)
// ============================================================

async function sendSMS({
  to,
  message,
}: {
  to: string;
  message: string;
}): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) return;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: message }),
  });
}
