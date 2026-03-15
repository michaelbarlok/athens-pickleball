import { Button, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";
import { formatDate, formatTime } from "@/lib/utils";

interface Props {
  groupName?: string;
  eventDate?: string;
  eventTime?: string;
  location?: string;
  sheetId?: string;
}

export default function NewSheet({ groupName, eventDate, eventTime, location, sheetId }: Props) {
  const formattedTime = eventTime ? formatTime(eventTime) : null;

  return (
    <BaseEmail preview="New event posted!" heading="New Sign-Up Sheet">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        A new event has been posted for <strong>{groupName ?? "your group"}</strong>!
      </Text>
      <Text style={{ color: "#374151", fontSize: "14px" }}>
        Date: {eventDate ? formatDate(eventDate) : "TBD"}
        {formattedTime ? ` at ${formattedTime}` : ""}
      </Text>
      {location && (
        <Text style={{ color: "#374151", fontSize: "14px" }}>
          Location: {location}
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
        Sign Up
      </Button>
    </BaseEmail>
  );
}
