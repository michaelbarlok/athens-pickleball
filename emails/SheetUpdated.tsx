import { Button, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";
import { formatDate } from "@/lib/utils";

interface Props {
  groupName?: string;
  eventDate?: string;
  changes?: string;
  sheetId?: string;
}

export default function SheetUpdated({ groupName, eventDate, changes, sheetId }: Props) {
  return (
    <BaseEmail preview="Event details updated" heading="Event Updated">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        The {groupName ?? "pickleball"} event on{" "}
        {eventDate ? formatDate(eventDate) : "the scheduled date"} has been updated.
      </Text>
      {changes && (
        <Text style={{ color: "#6b7280", fontSize: "14px" }}>
          Changes: {changes}
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
        View Updated Event
      </Button>
    </BaseEmail>
  );
}
