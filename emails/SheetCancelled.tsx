import { Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  groupName?: string;
  eventDate?: string;
}

export default function SheetCancelled({ groupName, eventDate }: Props) {
  return (
    <BaseEmail preview="Event cancelled" heading="Event Cancelled">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        The {groupName ?? "pickleball"} event scheduled for{" "}
        {eventDate ? new Date(eventDate).toLocaleDateString() : "the upcoming date"} has been
        cancelled by the admin.
      </Text>
      <Text style={{ color: "#6b7280", fontSize: "14px" }}>
        If you have any questions, please reach out to the league admin.
      </Text>
    </BaseEmail>
  );
}
