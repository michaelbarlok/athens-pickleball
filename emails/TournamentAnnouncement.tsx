import { Button, Hr, Img, Link, Section, Text } from "@react-email/components";
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

export default function TournamentAnnouncement({
  customMessage,
  tournamentTitle,
  tournamentId,
  tournamentLogoUrl,
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

  // Direct anchor to the recipient's "Nearby tournament notifications"
  // pref row so the opt-out footer lands them exactly where they need
  // to flip the switch. Falls back to the recipient-agnostic redirect
  // when we don't have a profile id (preview mode in the modal).
  const prefsUrl = recipientProfileId
    ? `${appUrl}/players/${recipientProfileId}/edit#type-tournament_announcement`
    : `${appUrl}/profile/notifications`;

  const heading = tournamentTitle ?? "New tournament";
  const previewText = tournamentTitle
    ? `${tournamentTitle} — registration is open`
    : "A new tournament has been posted";

  return (
    <BaseEmail preview={previewText} heading={heading}>
      {customMessage && customMessage.trim().length > 0 && (
        <Text
          style={{
            color: "#111827",
            fontSize: "14px",
            lineHeight: "22px",
            backgroundColor: "#f0fdfa",
            border: "1px solid #99f6e4",
            borderLeft: "4px solid #14b8a6",
            borderRadius: "6px",
            padding: "14px 16px",
            whiteSpace: "pre-wrap" as const,
            margin: "0 0 20px",
          }}
        >
          {customMessage}
        </Text>
      )}

      {tournamentLogoUrl && (
        <Section style={{ textAlign: "center" as const, margin: "0 0 16px" }}>
          <Img
            src={tournamentLogoUrl}
            alt=""
            width="96"
            height="96"
            style={{
              margin: "0 auto",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              objectFit: "contain" as const,
            }}
          />
        </Section>
      )}

      <Section
        style={{
          backgroundColor: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "16px 18px",
          margin: "0 0 20px",
        }}
      >
        <DetailRow label="When" value={[startDateLabel, startTimeLabel].filter(Boolean).join(" · ")} />
        <DetailRow label="Where" value={location} />
        <DetailRow label="Format" value={[formatLabel, typeLabel].filter(Boolean).join(" · ")} />
        {divisionLabels && divisionLabels.length > 0 && (
          <DetailRow label="Divisions" value={divisionLabels.join(", ")} />
        )}
        {(registrationOpensLabel || registrationClosesLabel) && (
          <DetailRow
            label="Registration"
            value={[
              registrationOpensLabel ? `opens ${registrationOpensLabel}` : null,
              registrationClosesLabel ? `closes ${registrationClosesLabel}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        )}
        {entryFee != null && entryFee > 0 && (
          <DetailRow label="Entry fee" value={`$${entryFee} per team`} />
        )}
        {paymentOptions && paymentOptions.length > 0 && (
          <DetailRow
            label="Payment"
            value={paymentOptions
              .map((o) => {
                const m = o.method ?? "";
                const label = PAYMENT_LABELS[m] ?? m;
                return o.detail ? `${label} (${o.detail})` : label;
              })
              .join(" · ")}
          />
        )}
      </Section>

      <Section style={{ textAlign: "center" as const, margin: "0 0 20px" }}>
        <Button
          href={tournamentUrl}
          style={{
            backgroundColor: "#0d9490",
            color: "#ffffff",
            padding: "12px 28px",
            borderRadius: "6px",
            fontSize: "15px",
            fontWeight: "600" as const,
            textDecoration: "none" as const,
            display: "inline-block",
          }}
        >
          View tournament & register
        </Button>
      </Section>

      <Hr style={{ borderColor: "#e2e8f0", margin: "20px 0 16px" }} />

      <Text
        style={{
          color: "#6b7280",
          fontSize: "12px",
          lineHeight: "18px",
          textAlign: "center" as const,
          margin: "0 0 6px",
        }}
      >
        Don&apos;t want emails about new tournaments?
      </Text>
      <Text
        style={{
          textAlign: "center" as const,
          margin: "0 0 4px",
        }}
      >
        <Link
          href={prefsUrl}
          style={{
            color: "#0d9490",
            textDecoration: "underline" as const,
            fontSize: "13px",
            fontWeight: "600" as const,
          }}
        >
          Turn off Nearby tournament notifications →
        </Link>
      </Text>
    </BaseEmail>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <Text
      style={{
        margin: "0 0 6px",
        fontSize: "13px",
        lineHeight: "20px",
        color: "#374151",
      }}
    >
      <span style={{ color: "#6b7280", fontWeight: "600" as const, marginRight: "6px" }}>
        {label}:
      </span>
      {value}
    </Text>
  );
}
