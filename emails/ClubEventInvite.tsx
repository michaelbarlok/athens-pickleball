import { EMAIL_PUBLIC_URL } from "@/lib/email-urls";
import { Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  clubName?: string;
  clubSlug?: string;
  eventTitle?: string;
  whenLine?: string;
  location?: string;
  description?: string;
  kind?: "created" | "updated" | "cancelled";
  cancellationMessage?: string;
}

const HEADINGS: Record<NonNullable<Props["kind"]>, string> = {
  created: "New club event",
  updated: "Club event updated",
  cancelled: "Club event cancelled",
};

export default function ClubEventInvite({
  clubName,
  clubSlug,
  eventTitle,
  whenLine,
  location,
  description,
  kind = "created",
  cancellationMessage,
}: Props) {
  const appUrl = EMAIL_PUBLIC_URL;
  const clubHref = clubSlug ? `${appUrl}/clubs/${clubSlug}` : `${appUrl}/clubs`;
  const heading = HEADINGS[kind];

  return (
    <BaseEmail
      preview={`${heading}: ${eventTitle ?? ""}`}
      heading={heading}
    >
      <Text style={{ color: "#374151", fontSize: "13px", lineHeight: "18px", marginBottom: "4px" }}>
        From <strong>{clubName ?? "your club"}</strong>
      </Text>

      <Text style={{ color: "#111827", fontSize: "18px", fontWeight: 600, margin: "8px 0 12px" }}>
        {eventTitle}
      </Text>

      {whenLine && (
        <Text style={{ color: "#374151", fontSize: "14px", margin: "0 0 4px" }}>
          🗓 {whenLine}
        </Text>
      )}

      {location && (
        <Text style={{ color: "#374151", fontSize: "14px", margin: "0 0 12px" }}>
          📍 {location}
        </Text>
      )}

      {kind === "cancelled" && cancellationMessage && (
        <Text
          style={{
            color: "#7f1d1d",
            fontSize: "14px",
            lineHeight: "22px",
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "6px",
            padding: "12px 14px",
            whiteSpace: "pre-wrap" as const,
            margin: "8px 0 16px",
          }}
        >
          {cancellationMessage}
        </Text>
      )}

      {kind !== "cancelled" && description && (
        <Text
          style={{
            color: "#111827",
            fontSize: "14px",
            lineHeight: "22px",
            backgroundColor: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
            padding: "12px 14px",
            whiteSpace: "pre-wrap" as const,
            margin: "8px 0 16px",
          }}
        >
          {description}
        </Text>
      )}

      <Text style={{ color: "#6b7280", fontSize: "13px" }}>
        <Link href={clubHref} style={{ color: "#14b8a6", textDecoration: "underline" }}>
          {kind === "cancelled" ? "View club →" : "RSVP on the club page →"}
        </Link>
      </Text>
    </BaseEmail>
  );
}
