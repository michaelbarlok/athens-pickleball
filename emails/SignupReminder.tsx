import { Button, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";
import { formatDate, formatDateTime } from "@/lib/utils";

interface Props {
  groupName?: string;
  eventDate?: string;
  closesAt?: string;
  sheetId?: string;
}

export default function SignupReminder({ groupName, eventDate, closesAt, sheetId }: Props) {
  return (
    <BaseEmail preview="Sign-up closing soon!" heading="Don't miss out!">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        Sign-up for <strong>{groupName ?? "the event"}</strong> on{" "}
        {eventDate ? formatDate(eventDate) : "an upcoming date"} is closing soon.
      </Text>
      {closesAt && (
        <Text style={{ color: "#6b7280", fontSize: "14px" }}>
          Closes at: {formatDateTime(closesAt)}
        </Text>
      )}
      <Button
        href={sheetId ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/sheets/${sheetId}` : "#"}
        style={{
          backgroundColor: "#2563eb",
          borderRadius: "6px",
          color: "#ffffff",
          fontSize: "14px",
          fontWeight: "600",
          padding: "12px 24px",
          textDecoration: "none",
          display: "inline-block",
          marginTop: "16px",
        }}
      >
        Sign Up Now
      </Button>
    </BaseEmail>
  );
}
