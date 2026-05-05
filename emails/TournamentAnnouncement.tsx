import { Hr, Link, Text } from "@react-email/components";
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
 * Tournament announcement broadcast. Designed to read like a personal
 * note from an organizer rather than a promo — Gmail's Promotions
 * classifier penalizes hero images, big colored CTAs, and dense
 * styled blocks, so this template uses plain text + an inline link
 * for the call to action and a single subtle separator for details.
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

  const detailRows: { label: string; value: string }[] = [];
  const whenValue = [startDateLabel, startTimeLabel].filter(Boolean).join(" · ");
  if (whenValue) detailRows.push({ label: "When", value: whenValue });
  if (location) detailRows.push({ label: "Where", value: location });
  const formatValue = [formatLabel, typeLabel].filter(Boolean).join(" · ");
  if (formatValue) detailRows.push({ label: "Format", value: formatValue });
  if (divisionLabels && divisionLabels.length > 0) {
    detailRows.push({ label: "Divisions", value: divisionLabels.join(", ") });
  }
  const regWindow = [
    registrationOpensLabel ? `opens ${registrationOpensLabel}` : null,
    registrationClosesLabel ? `closes ${registrationClosesLabel}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (regWindow) detailRows.push({ label: "Registration", value: regWindow });
  if (entryFee != null && entryFee > 0) {
    detailRows.push({ label: "Entry fee", value: `$${entryFee} per team` });
  }
  if (paymentOptions && paymentOptions.length > 0) {
    detailRows.push({
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
      {customMessage && customMessage.trim().length > 0 && (
        <Text
          style={{
            color: "#111827",
            fontSize: "15px",
            lineHeight: "22px",
            whiteSpace: "pre-wrap" as const,
            margin: "0 0 18px",
          }}
        >
          {customMessage}
        </Text>
      )}

      {detailRows.map((row) => (
        <Text
          key={row.label}
          style={{
            margin: "0 0 4px",
            fontSize: "14px",
            lineHeight: "22px",
            color: "#374151",
          }}
        >
          <span style={{ color: "#6b7280", fontWeight: "600" as const }}>
            {row.label}:
          </span>{" "}
          {row.value}
        </Text>
      ))}

      <Text
        style={{
          margin: "20px 0 0",
          fontSize: "14px",
          lineHeight: "22px",
          color: "#111827",
        }}
      >
        <Link
          href={tournamentUrl}
          style={{ color: "#0d9490", textDecoration: "underline" as const }}
        >
          View tournament details and register →
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
