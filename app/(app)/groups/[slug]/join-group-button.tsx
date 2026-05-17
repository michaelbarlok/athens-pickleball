"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/confirm-modal";

/**
 * Group-detail-page Join button. Calls the unified
 * /api/groups/[id]/join route; on 409 with `requiresClubJoin`,
 * surfaces a "Join {club} too?" confirmation popup before retrying
 * with `acceptClub: true`. Private clubs deflect to the club page
 * (auto-join isn't possible without an invite).
 */
export function JoinGroupButton({
  groupId,
  slug,
}: {
  groupId: string;
  slug: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function join() {
    setError("");
    setBusy(true);
    try {
      const first = await fetch(`/api/groups/${groupId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (first.ok) {
        router.refresh();
        // Push to the canonical slug URL so server-side membership
        // checks pick up the new row (matches the previous redirect).
        router.push(`/groups/${slug}`);
        return;
      }
      const data = await first.json().catch(() => ({}));
      if (first.status === 409 && data?.requiresClubJoin && data.club) {
        const club: { name: string; slug: string; visibility: string } = data.club;
        if (club.visibility === "private") {
          const ok = await confirm({
            title: `${club.name} is private`,
            description: `This group is part of ${club.name}, which is invite-only. Open the club page and redeem an invite link from a member before joining the group.`,
            confirmLabel: "Open club page",
            cancelLabel: "Not now",
          });
          if (ok) router.push(`/clubs/${club.slug}`);
          return;
        }
        const ok = await confirm({
          title: `Join ${club.name} too?`,
          description: `This group is part of ${club.name}. You need to be a member of the club to join the group. We'll add you to both.`,
          confirmLabel: "Join both",
          cancelLabel: "Cancel",
        });
        if (!ok) return;
        const second = await fetch(`/api/groups/${groupId}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acceptClub: true }),
        });
        const secondData = await second.json().catch(() => ({}));
        if (!second.ok) {
          setError(secondData?.error ?? "Couldn't join.");
          return;
        }
        router.refresh();
        router.push(`/groups/${slug}`);
        return;
      }
      setError(data?.error ?? "Couldn't join the group.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <button type="button" onClick={join} disabled={busy} className="btn-primary">
        {busy ? "Joining…" : "Join Group"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
