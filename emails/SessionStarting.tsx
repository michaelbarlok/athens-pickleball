import { Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  groupName?: string;
  eventDate?: string;
  location?: string;
}

export default function SessionStarting({ groupName, eventDate, location }: Props) {
  return (
    <BaseEmail preview="Session starting soon!" heading="Session Starting">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        The <strong>{groupName ?? "pickleball"}</strong> session is about to begin!
      </Text>
      {eventDate && (
        <Text style={{ color: "#374151", fontSize: "14px" }}>
          Date: {new Date(eventDate).toLocaleDateString()}
        </Text>
      )}
      {location && (
        <Text style={{ color: "#374151", fontSize: "14px" }}>
          Location: {location}
        </Text>
      )}
      <Text style={{ color: "#6b7280", fontSize: "14px", marginTop: "12px" }}>
        Please arrive on time for check-in. Courts will be assigned shortly after check-in closes.
      </Text>
    </BaseEmail>
  );
}
