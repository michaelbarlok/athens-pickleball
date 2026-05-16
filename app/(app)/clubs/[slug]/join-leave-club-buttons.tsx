"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useConfirm } from "@/components/confirm-modal";

export function JoinLeaveClubButtons({
  clubId,
  clubSlug,
  visibility,
  isLoggedIn,
  isMember,
  isAdmin,
  inviteToken,
}: {
  clubId: string;
  clubSlug: string;
  visibility: "public" | "private";
  isLoggedIn: boolean;
  isMember: boolean;
  isAdmin: boolean;
  inviteToken: string | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function join() {
    setError("");
    setBusy(true);
    try {
      const url = inviteToken
        ? `/api/clubs/${clubId}/join?token=${encodeURIComponent(inviteToken)}`
        : `/api/clubs/${clubId}/join`;
      const res = await fetch(url, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't join the club.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    const ok = await confirm({
      title: "Leave this club?",
      description:
        "You'll lose access to club-hosted tournaments. Group memberships you've joined under this club stay intact.",
      confirmLabel: "Leave",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/clubs/${clubId}/leave`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't leave the club.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/login?next=${encodeURIComponent(`/clubs/${clubSlug}${inviteToken ? `?token=${inviteToken}` : ""}`)}`}
          className="btn-primary"
        >
          Sign in to join
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!isMember && (visibility === "public" || inviteToken) && (
          <button onClick={join} disabled={busy} className="btn-primary">
            {busy ? "Joining…" : "Join Club"}
          </button>
        )}
        {!isMember && visibility === "private" && !inviteToken && (
          <p className="text-sm text-surface-muted italic">
            This club is private. You need an invite link from a member to join.
          </p>
        )}
        {isMember && !isAdmin && (
          <button onClick={leave} disabled={busy} className="btn-secondary text-xs text-red-400 hover:text-red-300">
            {busy ? "…" : "Leave Club"}
          </button>
        )}
        {isAdmin && (
          <Link href={`/admin/clubs/${clubId}`} className="btn-secondary">
            Manage Club
          </Link>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
