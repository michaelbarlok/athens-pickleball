"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useConfirm } from "@/components/confirm-modal";

export interface PendingGroupRequestRow {
  id: string;
  message: string | null;
  created_at: string;
  group: { id: string; name: string; slug: string } | null;
  requester: { id: string; display_name: string } | null;
}

/**
 * Approve / reject queue for pending club-attach requests. Rendered
 * inside the club manage page when at least one pending request
 * exists. Each row hits POST /api/clubs/[id]/group-requests/[reqId]
 * with `{ action: 'approve'|'reject' }`.
 */
export function ClubGroupRequestsPanel({
  clubId,
  pending,
}: {
  clubId: string;
  pending: PendingGroupRequestRow[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function act(requestId: string, action: "approve" | "reject", groupName: string) {
    if (action === "reject") {
      const ok = await confirm({
        title: `Reject ${groupName}'s request?`,
        description:
          "The group will stay standalone. The requester will get a notification letting them know.",
        confirmLabel: "Reject",
        variant: "danger",
      });
      if (!ok) return;
    }
    setBusyId(requestId);
    setError("");
    try {
      const res = await fetch(`/api/clubs/${clubId}/group-requests/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? `Couldn't ${action} the request.`);
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (pending.length === 0) return null;

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-base font-semibold text-dark-100">
          Pending Group Requests ({pending.length})
        </h2>
        <p className="mt-1 text-xs text-surface-muted">
          Members who created a group and asked to attach it to this club. Approval
          flips the group's club to this one and inherits your admin team into the
          group automatically.
        </p>
      </div>

      <ul className="divide-y divide-surface-border rounded-lg ring-1 ring-surface-border bg-surface-raised overflow-hidden">
        {pending.map((r) => (
          <li key={r.id} className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-dark-100 truncate">
                  {r.group ? (
                    <Link
                      href={`/groups/${r.group.slug}`}
                      className="hover:text-brand-300"
                    >
                      {r.group.name}
                    </Link>
                  ) : (
                    "(deleted group)"
                  )}
                </p>
                <p className="text-xs text-surface-muted">
                  Requested by {r.requester?.display_name ?? "Unknown"} ·{" "}
                  {new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => act(r.id, "reject", r.group?.name ?? "this group")}
                  disabled={busyId === r.id}
                  className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40"
                >
                  {busyId === r.id ? "…" : "Reject"}
                </button>
                <button
                  type="button"
                  onClick={() => act(r.id, "approve", r.group?.name ?? "this group")}
                  disabled={busyId === r.id || !r.group}
                  className="btn-primary text-xs px-3 py-1"
                >
                  {busyId === r.id ? "…" : "Approve"}
                </button>
              </div>
            </div>
            {r.message && (
              <p className="text-xs text-dark-200 whitespace-pre-wrap rounded-md bg-surface-overlay ring-1 ring-surface-border p-2">
                {r.message}
              </p>
            )}
          </li>
        ))}
      </ul>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </section>
  );
}
