import { EMAIL_PUBLIC_URL } from "@/lib/email-urls";
import { Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  clubName?: string;
  clubSlug?: string;
  title?: string;
  message?: string;
}

export default function ClubAnnouncement({
  clubName,
  clubSlug,
  title,
  message,
}: Props) {
  const appUrl = EMAIL_PUBLIC_URL;
  const clubHref = clubSlug ? `${appUrl}/clubs/${clubSlug}` : `${appUrl}/clubs`;

  return (
    <BaseEmail
      preview={title ?? `Announcement from ${clubName ?? "your club"}`}
      heading={title ?? "Club Announcement"}
    >
      <Text style={{ color: "#374151", fontSize: "13px", lineHeight: "18px", marginBottom: "4px" }}>
        From <strong>{clubName ?? "your club"}</strong>
      </Text>

      <Text
        style={{
          color: "#111827",
          fontSize: "14px",
          lineHeight: "24px",
          backgroundColor: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "6px",
          padding: "14px 16px",
          whiteSpace: "pre-wrap" as const,
          margin: "8px 0 16px",
        }}
      >
        {message}
      </Text>

      <Text style={{ color: "#6b7280", fontSize: "13px" }}>
        <Link href={clubHref} style={{ color: "#14b8a6", textDecoration: "underline" }}>
          View your club →
        </Link>
      </Text>
    </BaseEmail>
  );
}
