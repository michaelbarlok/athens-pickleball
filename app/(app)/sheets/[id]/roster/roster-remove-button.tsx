"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface RosterRemoveButtonProps {
  registrationId: string;
  sheetId: string;
  playerName: string;
}

export function RosterRemoveButton({
  registrationId,
  sheetId,
  playerName,
}: RosterRemoveButtonProps) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    if (!confirm(`Remove ${playerName} from this sheet?`)) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("registrations")
        .update({ status: "withdrawn" })
        .eq("id", registrationId);

      if (error) throw error;
      router.refresh();
    } catch (err) {
      console.error("Failed to remove player:", err);
      alert("Failed to remove player. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleRemove}
      disabled={loading}
      className="btn-danger text-xs"
    >
      {loading ? "Removing..." : "Remove"}
    </button>
  );
}
