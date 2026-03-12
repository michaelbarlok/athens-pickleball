import { Button, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  groupName?: string;
  eventDate?: string;
  closesAt?: string;
  sheetId?: string;
}

export default function WithdrawReminder({ groupName, eventDate, closesAt, sheetId }: Props) {
  return (
    <BaseEmail preview="Withdrawal window closing" heading="Withdrawal Window Closing">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        The withdrawal window for <strong>{groupName ?? "the event"}</strong> on{" "}
        {eventDate ? new Date(eventDate).toLocaleDateString() : "the scheduled date"} is closing soon.
      </Text>
      {closesAt && (
        <Text style={{ color: "#6b7280", fontSize: "14px" }}>
          Closes at: {new Date(closesAt).toLocaleString()}
        </Text>
      )}
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        If you can&apos;t make it, please withdraw now so someone on the waitlist can take your spot.
      </Text>
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
        View Event
      </Button>
    </BaseEmail>
  );
}
