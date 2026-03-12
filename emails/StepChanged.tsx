import { Text } from "@react-email/components";
import BaseEmail from "./BaseEmail";

interface Props {
  groupName?: string;
  oldStep?: number;
  newStep?: number;
  direction?: "up" | "down";
}

export default function StepChanged({ groupName, oldStep, newStep, direction }: Props) {
  const movedUp = direction === "up";
  return (
    <BaseEmail
      preview={`Step ${movedUp ? "up" : "down"} in ${groupName ?? "your group"}`}
      heading={movedUp ? "You moved up!" : "Step change"}
    >
      <Text style={{ color: "#374151", fontSize: "14px", lineHeight: "24px" }}>
        Your ladder step in <strong>{groupName ?? "your group"}</strong> has changed:
      </Text>
      <Text
        style={{
          fontSize: "24px",
          fontWeight: "700",
          color: movedUp ? "#059669" : "#dc2626",
          textAlign: "center" as const,
          margin: "16px 0",
        }}
      >
        Step {oldStep} → Step {newStep} {movedUp ? "↑" : "↓"}
      </Text>
      <Text style={{ color: "#6b7280", fontSize: "14px" }}>
        {movedUp
          ? "Great job! Keep it up!"
          : "Keep playing and you'll climb back up."}
      </Text>
    </BaseEmail>
  );
}
