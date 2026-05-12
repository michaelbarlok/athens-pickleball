import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import crypto from "crypto";

/**
 * Resend webhook receiver.
 *
 * Resend (via Svix) POSTs an event here whenever an email status
 * changes — `email.bounced`, `email.complained`, etc. We use the
 * bounce + complaint signals to keep notify() from re-emailing
 * dead addresses forever.
 *
 * Configuration the user has to do once, outside this code:
 *   1. In the Resend dashboard, add a webhook endpoint pointing at
 *      https://tristarpickleball.com/api/webhooks/resend.
 *   2. Subscribe it to `email.bounced` and `email.complained`.
 *   3. Copy the signing secret (starts `whsec_`) and set it as the
 *      `RESEND_WEBHOOK_SECRET` env var on Vercel + .env.local.
 *
 * Until that's done, this endpoint silently returns 200 — the
 * email_bouncing column stays false everywhere and notify() behaves
 * exactly as before. Once the webhook starts firing, profiles whose
 * mail bounces 3+ times are flagged and skipped on the email channel.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Optional signature verification. If RESEND_WEBHOOK_SECRET isn't
  // set we accept any payload — useful for the period between
  // shipping this endpoint and configuring the dashboard.
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    const svixId = request.headers.get("svix-id") ?? "";
    const svixTimestamp = request.headers.get("svix-timestamp") ?? "";
    const svixSignature = request.headers.get("svix-signature") ?? "";
    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: "missing signature" }, { status: 401 });
    }
    if (!verifySvix(rawBody, svixId, svixTimestamp, svixSignature, secret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  let event: { type?: string; data?: { to?: string[] | string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // Only act on bounces and spam complaints. Sent / delivered /
  // opened / clicked are noise for this purpose.
  if (event.type !== "email.bounced" && event.type !== "email.complained") {
    return NextResponse.json({ ok: true });
  }

  // `data.to` is sometimes a string, sometimes an array — normalize.
  const toRaw = event.data?.to;
  const recipient = Array.isArray(toRaw) ? toRaw[0] : toRaw;
  if (!recipient || typeof recipient !== "string") {
    return NextResponse.json({ ok: true });
  }

  const supabase = await createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email_bounce_count")
    .ilike("email", recipient)
    .maybeSingle();

  if (!profile) {
    // Recipient might not be a registered user (admin sent a one-off
    // to an external address). Nothing to flag.
    return NextResponse.json({ ok: true });
  }

  // Spam complaint = immediate mute (the user hit "report spam," we
  // shouldn't keep emailing them no matter what). Bounces accumulate
  // and only flag at 3+.
  const newCount = (profile.email_bounce_count ?? 0) + 1;
  const shouldMute =
    event.type === "email.complained" ? true : newCount >= 3;

  await supabase
    .from("profiles")
    .update({
      email_bounce_count: newCount,
      email_bouncing: shouldMute,
      last_bounce_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  return NextResponse.json({ ok: true });
}

/**
 * Verify a Svix-style webhook signature using HMAC-SHA256.
 *
 * Header format: `svix-signature: v1,<base64-sig> v1,<another-sig>` —
 * Svix can rotate keys so multiple signatures may be sent; we accept
 * if any one matches. The secret is "whsec_" + base64-encoded bytes.
 *
 * Reference: https://docs.svix.com/receiving/verifying-payloads/how-manual
 */
function verifySvix(
  body: string,
  svixId: string,
  svixTimestamp: string,
  svixSignatureHeader: string,
  secret: string
): boolean {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const expected = crypto
    .createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");

  // Constant-time compare against each "v1,<sig>" pair in the header.
  for (const part of svixSignatureHeader.split(" ")) {
    const [, sig] = part.split(",", 2);
    if (!sig) continue;
    if (
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      return true;
    }
  }
  return false;
}
