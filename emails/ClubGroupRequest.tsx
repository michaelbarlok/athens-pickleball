import { EMAIL_PUBLIC_URL } from "@/lib/email-urls";
import { Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  /** "requested" → going TO club admins; "approved" / "rejected" → going TO the requester. */
  kind?: "requested" | "approved" | "rejected";
  clubName?: string;
  clubSlug?: string;
  groupName?: string;
  groupSlug?: string;
  requesterName?: string;
  message?: string;
}

const HEADINGS: Record<NonNullable<Props["kind"]>, string> = {
  requested: "New group attach request",
  approved: "Your group request was approved",
  rejected: "Your group request was declined",
};

export default function ClubGroupRequest({
  kind = "requested",
  clubName,
  clubSlug,
  groupName,
  groupSlug,
  requesterName,
  message,
}: Props) {
  const appUrl = EMAIL_PUBLIC_URL;
  // The CTA depends on audience: requesters land on the group page;
  // club admins land on the manage page where the approve/reject
  // buttons live.
  const ctaHref =
    kind === "requested"
      ? clubSlug
        ? `${appUrl}/clubs/${clubSlug}`
        : `${appUrl}/clubs`
      : groupSlug
        ? `${appUrl}/groups/${groupSlug}`
        : `${appUrl}/groups`;
  const ctaLabel =
    kind === "requested" ? "Open club manage page →" : "Open group →";

  return (
    <BaseEmail
      preview={
        kind === "requested"
          ? `${requesterName ?? "Someone"} wants to attach ${groupName ?? "a group"} to ${clubName ?? "your club"}`
          : kind === "approved"
            ? `${groupName ?? "Your group"} is now part of ${clubName ?? "the club"}`
            : `${clubName ?? "The club"} declined the attach request`
      }
      heading={HEADINGS[kind]}
    >
      {kind === "requested" ? (
        <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "22px" }}>
          <strong>{requesterName ?? "A member"}</strong> created the group{" "}
          <strong>{groupName ?? "a group"}</strong> and is asking to attach it to{" "}
          <strong>{clubName ?? "your club"}</strong>.
        </Text>
      ) : (
        <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "22px" }}>
          {kind === "approved" ? (
            <>
              Your request to attach <strong>{groupName ?? "your group"}</strong> to{" "}
              <strong>{clubName ?? "the club"}</strong> was approved. Members of the
              club now see your group under the club's roster.
            </>
          ) : (
            <>
              Your request to attach <strong>{groupName ?? "your group"}</strong> to{" "}
              <strong>{clubName ?? "the club"}</strong> was declined. Your group is
              still active as a standalone group.
            </>
          )}
        </Text>
      )}

      {message && (
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
          {message}
        </Text>
      )}

      <Text style={{ color: "#6b7280", fontSize: "13px" }}>
        <Link href={ctaHref} style={{ color: "#14b8a6", textDecoration: "underline" }}>
          {ctaLabel}
        </Link>
      </Text>
    </BaseEmail>
  );
}
