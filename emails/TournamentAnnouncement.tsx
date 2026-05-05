import { Hr, Link, Section, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface PaymentOption {
  method?: string;
  detail?: string;
}

interface Props {
  /** Custom message from the site admin sending the broadcast. Optional. */
  customMessage?: string;
  tournamentTitle?: string;
  tournamentId?: string;
  /** Kept for back-compat with the API route's emailData payload —
   *  no longer rendered. The hero logo image was a Promotions-tab
   *  signal; we now rely on the BaseEmail header's wordmark only. */
  tournamentLogoUrl?: string | null;
  startDateLabel?: string | null;
  startTimeLabel?: string | null;
  location?: string;
  formatLabel?: string;
  typeLabel?: string;
  divisionLabels?: string[];
  registrationOpensLabel?: string | null;
  registrationClosesLabel?: string | null;
  entryFee?: number | null;
  paymentOptions?: PaymentOption[];
  /** Profile id of the recipient — used to deep-link the unsubscribe footer. */
  recipientProfileId?: string;
}

const PAYMENT_LABELS: Record<string, string> = {
  venmo: "Venmo",
  paypal: "PayPal",
  cash: "Cash",
  check: "Check",
};

/**
 * Tournament announcement broadcast.
 *
 * Designed to read like a personal note from an organizer rather
 * than a promo. Gmail's Promotions classifier reacts to *patterns* —
 * hero images, big filled CTAs, multi-column layouts, photo-heavy
 * blocks — so this template avoids those. Typography, spacing, a
 * single accent colour, and unicode glyphs (no images) carry the
 * visual weight instead.
 */
export default function TournamentAnnouncement({
  customMessage,
  tournamentTitle,
  tournamentId,
  startDateLabel,
  startTimeLabel,
  location,
  formatLabel,
  typeLabel,
  divisionLabels,
  registrationOpensLabel,
  registrationClosesLabel,
  entryFee,
  paymentOptions,
  recipientProfileId,
}: Props) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const tournamentUrl = tournamentId
    ? `${appUrl}/tournaments/${tournamentId}`
    : `${appUrl}/tournaments`;

  // Deep-link straight to the recipient's "Nearby tournament
  // notifications" pref row when we have their profile id; fall
  // back to the recipient-agnostic redirect otherwise.
  const prefsUrl = recipientProfileId
    ? `${appUrl}/players/${recipientProfileId}/edit#type-tournament_announcement`
    : `${appUrl}/profile/notifications`;

  const heading = tournamentTitle ?? "New tournament";
  const previewText = tournamentTitle
    ? `${tournamentTitle} — registration is open`
    : "A new tournament has been posted";

  // Detail rows. Each label gets a small unicode glyph for a touch
  // of personality without using <img> tags (which trip Promotions
  // image-ratio heuristics).
  const detailRows: { glyph: string; label: string; value: string }[] = [];
  const whenValue = [startDateLabel, startTimeLabel].filter(Boolean).join(" · ");
  if (whenValue) detailRows.push({ glyph: "📅", label: "When", value: whenValue });
  if (location) detailRows.push({ glyph: "📍", label: "Where", value: location });
  const formatValue = [formatLabel, typeLabel].filter(Boolean).join(" · ");
  if (formatValue) detailRows.push({ glyph: "🏆", label: "Format", value: formatValue });
  if (divisionLabels && divisionLabels.length > 0) {
    detailRows.push({ glyph: "🥇", label: "Divisions", value: divisionLabels.join(", ") });
  }
  const regWindow = [
    registrationOpensLabel ? `opens ${registrationOpensLabel}` : null,
    registrationClosesLabel ? `closes ${registrationClosesLabel}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (regWindow) detailRows.push({ glyph: "🗓", label: "Registration", value: regWindow });
  if (entryFee != null && entryFee > 0) {
    detailRows.push({ glyph: "💵", label: "Entry fee", value: `$${entryFee} per team` });
  }
  if (paymentOptions && paymentOptions.length > 0) {
    detailRows.push({
      glyph: "💳",
      label: "Payment",
      value: paymentOptions
        .map((o) => {
          const m = o.method ?? "";
          const label = PAYMENT_LABELS[m] ?? m;
          return o.detail ? `${label} (${o.detail})` : label;
        })
        .join(" · "),
    });
  }

  return (
    <BaseEmail preview={previewText} heading={heading}>
      <Text
        style={{
          color: "#6b7280",
          fontSize: "13px",
          lineHeight: "20px",
          margin: "0 0 16px",
        }}
      >
        From the Tri-Star Pickleball team
      </Text>

      {customMessage && customMessage.trim().length > 0 && (
        <Text
          style={{
            color: "#1f2937",
            fontSize: "15px",
            lineHeight: "24px",
            whiteSpace: "pre-wrap" as const,
            margin: "0 0 22px",
            paddingLeft: "14px",
            borderLeft: "3px solid #0d9490",
          }}
        >
          {customMessage}
        </Text>
      )}

      {detailRows.length > 0 && (
        <Section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "14px 18px",
            margin: "0 0 22px",
          }}
        >
          {detailRows.map((row, idx) => (
            <Text
              key={row.label}
              style={{
                margin: idx === 0 ? "0 0 6px" : idx === detailRows.length - 1 ? "0" : "0 0 6px",
                fontSize: "14px",
                lineHeight: "22px",
                color: "#374151",
              }}
            >
              <span style={{ marginRight: "8px" }} aria-hidden="true">
                {row.glyph}
              </span>
              <span style={{ color: "#6b7280", fontWeight: "600" as const }}>
                {row.label}:
              </span>{" "}
              <span style={{ color: "#111827" }}>{row.value}</span>
            </Text>
          ))}
        </Section>
      )}

      <Text
        style={{
          margin: "0 0 8px",
          fontSize: "14px",
          lineHeight: "22px",
        }}
      >
        <Link
          href={tournamentUrl}
          style={{
            display: "inline-block",
            color: "#0d9490",
            textDecoration: "none" as const,
            fontWeight: "600" as const,
            border: "1.5px solid #0d9490",
            borderRadius: "999px",
            padding: "8px 18px",
            fontSize: "14px",
          }}
        >
          View details and register →
        </Link>
      </Text>

      <Text
        style={{
          color: "#6b7280",
          fontSize: "13px",
          lineHeight: "20px",
          margin: "16px 0 0",
        }}
      >
        Or paste this link into your browser:{" "}
        <Link
          href={tournamentUrl}
          style={{ color: "#6b7280", textDecoration: "underline" as const }}
        >
          {tournamentUrl}
        </Link>
      </Text>

      <Hr style={{ borderColor: "#e2e8f0", margin: "24px 0 14px" }} />

      <Text
        style={{
          color: "#6b7280",
          fontSize: "12px",
          lineHeight: "18px",
          margin: "0",
        }}
      >
        You&apos;re receiving this because you have an account on
        tristarpickleball.com. Don&apos;t want emails about new
        tournaments?{" "}
        <Link
          href={prefsUrl}
          style={{ color: "#0d9490", textDecoration: "underline" as const }}
        >
          Turn off Nearby tournament notifications
        </Link>
        .
      </Text>
    </BaseEmail>
  );
}
