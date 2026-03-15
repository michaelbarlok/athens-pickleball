import { Button, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";
import { formatDate } from "@/lib/utils";

interface Props {
  groupName?: string;
  eventDate?: string;
  sheetId?: string;
}

export default function WaitlistPromoted({ groupName, eventDate, sheetId }: Props) {
  return (
    <BaseEmail preview="You're in!" heading="You've been promoted from the waitlist!">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        A spot opened up and you&apos;ve been moved from the waitlist to the main roster for{" "}
        <strong>{groupName ?? "the event"}</strong> on{" "}
        {eventDate ? formatDate(eventDate) : "the upcoming date"}.
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
