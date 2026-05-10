import { EMAIL_PUBLIC_URL } from "@/lib/email-urls";
import { Button, Link, Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";
import { formatDateInZone, DEFAULT_TZ } from "@/lib/utils";

interface Props {
  groupName?: string;
  eventDate?: string;
  changes?: string;
  sheetId?: string;
  /** IANA timezone of the sheet's group. Defaults to ET if the
   *  caller didn't pass one (every existing sheet was created in
   *  ET pre-multitenant). */
  tz?: string;
}

export default function SheetUpdated({ groupName, eventDate, changes, sheetId, tz }: Props) {
  const appUrl = EMAIL_PUBLIC_URL;
  const zone = tz ?? DEFAULT_TZ;

  return (
    <BaseEmail preview="Event details updated" heading="Event Updated">
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        The {groupName ?? "pickleball"} event on{" "}
        {eventDate ? formatDateInZone(eventDate, zone) : "the scheduled date"} has been updated.
      </Text>
      {changes && (
        <Text style={{ color: "#6b7280", fontSize: "14px" }}>
          Changes: {changes}
        </Text>
      )}
      <Button
        href={sheetId ? `${appUrl}/sheets/${sheetId}` : "#"}
        style={buttonStyle}
      >
        View Updated Event
      </Button>
      <Text style={{ color: "#6b7280", fontSize: "13px", marginTop: "20px" }}>
        Have questions?{" "}
        <Link href={sheetId ? `${appUrl}/sheets/${sheetId}` : "#"} style={linkStyle}>
          Contact Group Admins
        </Link>
      </Text>
    </BaseEmail>
  );
}

const buttonStyle = {
  backgroundColor: "#14b8a6",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600" as const,
  padding: "12px 24px",
  textDecoration: "none" as const,
  display: "inline-block" as const,
  marginTop: "16px",
};

const linkStyle = {
  color: "#14b8a6",
  textDecoration: "underline" as const,
};
