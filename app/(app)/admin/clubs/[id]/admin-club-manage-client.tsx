"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useConfirm } from "@/components/confirm-modal";
import { FormError } from "@/components/form-error";
import { ClubLogoUpload } from "@/components/club-logo-upload";
import { US_STATES } from "@/lib/us-states";
import type { Club } from "@/types/database";

type Member = {
  club_role: "admin" | "member";
  joined_at: string;
  profile: { id: string; display_name: string; email: string; avatar_url?: string | null } | null;
};

type AttachedGroup = {
  id: string;
  name: string;
  slug: string;
  group_type: string;
  visibility: string;
  is_active: boolean;
};

type UnattachedGroup = {
  id: string;
  name: string;
  group_type: string;
  city: string | null;
  state: string | null;
};

export function AdminClubManageClient({
  club,
  members,
  attachedGroups,
  unattachedGroups,
  canDeleteClub,
}: {
  club: Club;
  members: Member[];
  attachedGroups: AttachedGroup[];
  unattachedGroups: UnattachedGroup[];
  /** Only site admins can hard-delete a club. Club admins manage
   *  everything else but the Danger Zone button is hidden for them. */
  canDeleteClub: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();

  // ── Form state for editable club metadata ──────────────────
  const [name, setName] = useState(club.name);
  const [description, setDescription] = useState(club.description ?? "");
  const [city, setCity] = useState(club.city ?? "");
  const [stateCode, setStateCode] = useState(club.state ?? "");
  const [visibility, setVisibility] = useState<"public" | "private">(club.visibility);
  const [logoUrl, setLogoUrl] = useState<string | null>(club.logo_url ?? null);
  const [isActive, setIsActive] = useState(club.is_active);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function handleSave() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/clubs/${club.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          city: city.trim() || null,
          state: stateCode || null,
          visibility,
          logo_url: logoUrl,
          is_active: isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  // ── Group attach / detach ──────────────────────────────────
  const [groupToAttach, setGroupToAttach] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);

  async function attachGroup() {
    if (!groupToAttach) return;
    setGroupBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/clubs/${club.id}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: groupToAttach }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't attach group");
        return;
      }
      setGroupToAttach("");
      router.refresh();
    } finally {
      setGroupBusy(false);
    }
  }

  async function detachGroup(groupId: string, groupName: string) {
    const ok = await confirm({
      title: `Detach "${groupName}"?`,
      description:
        "The group will become standalone again. Its members, sheets, sessions, rankings, and group admins are completely untouched — only the club_id link is removed.",
      confirmLabel: "Detach",
    });
    if (!ok) return;
    setGroupBusy(true);
    try {
      const res = await fetch(`/api/clubs/${club.id}/groups`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't detach group");
        return;
      }
      router.refresh();
    } finally {
      setGroupBusy(false);
    }
  }

  // ── Membership management ──────────────────────────────────
  const [memberBusy, setMemberBusy] = useState<string | null>(null);
  async function setRole(profileId: string, role: "admin" | "member") {
    setMemberBusy(profileId);
    setError("");
    try {
      const res = await fetch(`/api/clubs/${club.id}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't change role");
        return;
      }
      router.refresh();
    } finally {
      setMemberBusy(null);
    }
  }
  async function removeMember(profileId: string, displayName: string) {
    const ok = await confirm({
      title: `Remove ${displayName} from this club?`,
      description: "They'll lose access to club-hosted tournaments. Group memberships are unaffected.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;
    setMemberBusy(profileId);
    try {
      const res = await fetch(`/api/clubs/${club.id}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't remove member");
        return;
      }
      router.refresh();
    } finally {
      setMemberBusy(null);
    }
  }

  // ── Delete club ────────────────────────────────────────────
  async function handleDelete() {
    const ok = await confirm({
      title: `Delete "${club.name}"?`,
      description:
        "Constituent groups are detached and become standalone — their members, rankings, sheets, and sessions are untouched. Tournaments currently hosted by this club become individual tournaments. Club memberships and invites are removed. This cannot be undone.",
      confirmLabel: "Delete Club",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/clubs/${club.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Couldn't delete club");
        return;
      }
      router.push("/admin/clubs");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete club");
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Details ── */}
      <section className="card space-y-4">
        <h2 className="text-base font-semibold text-dark-100">Club Details</h2>

        <ClubLogoUpload
          clubId={club.id}
          currentUrl={logoUrl}
          onUploaded={(url) => setLogoUrl(url)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              maxLength={120}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">Visibility</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "public" | "private")}
              className="input"
            >
              <option value="public">Public</option>
              <option value="private">Private (invite-only)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-dark-200 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input min-h-[80px]"
              maxLength={2000}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">State</label>
            <select value={stateCode} onChange={(e) => setStateCode(e.target.value)} className="input">
              <option value="">—</option>
              {US_STATES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span className="text-sm text-dark-200">Active</span>
        </label>

        <FormError message={error} />

        <div className="flex items-center justify-end gap-3 pt-2">
          {savedAt && Date.now() - savedAt < 4000 && (
            <span className="text-xs text-teal-400">Saved</span>
          )}
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </section>

      {/* ── Groups in this club ── */}
      <section className="card space-y-4">
        <div>
          <h2 className="text-base font-semibold text-dark-100">Groups in this Club</h2>
          <p className="mt-1 text-xs text-surface-muted">
            Attaching a group only sets its <code>club_id</code>. Members, rankings, sheets,
            sessions, and group admins are <strong>not touched</strong>. Club admins gain group
            admin rights here automatically (read-time inheritance).
          </p>
        </div>

        {attachedGroups.length > 0 ? (
          <ul className="divide-y divide-surface-border rounded-lg ring-1 ring-surface-border bg-surface-raised overflow-hidden">
            {attachedGroups.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <Link href={`/groups/${g.slug}`} className="text-sm font-medium text-dark-100 hover:text-brand-300">
                    {g.name}
                  </Link>
                  <p className="text-xs text-surface-muted">
                    {g.group_type === "free_play" ? "Free Play" : "Ladder"} · {g.visibility} · {g.is_active ? "active" : "inactive"}
                  </p>
                </div>
                <button
                  onClick={() => detachGroup(g.id, g.name)}
                  disabled={groupBusy}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Detach
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-surface-muted italic">No groups attached yet.</p>
        )}

        {unattachedGroups.length > 0 && (
          <div className="flex items-end gap-2 pt-1 border-t border-surface-border/60">
            <div className="flex-1">
              <label className="block text-sm font-medium text-dark-200 mb-1">Attach a standalone group</label>
              <select
                value={groupToAttach}
                onChange={(e) => setGroupToAttach(e.target.value)}
                className="input"
              >
                <option value="">Pick a group…</option>
                {unattachedGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                    {g.city || g.state ? ` — ${[g.city, g.state].filter(Boolean).join(", ")}` : ""}
                    {" · "}
                    {g.group_type === "free_play" ? "Free Play" : "Ladder"}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={attachGroup}
              disabled={!groupToAttach || groupBusy}
              className="btn-primary"
            >
              {groupBusy ? "…" : "Attach"}
            </button>
          </div>
        )}
      </section>

      {/* ── Members ── */}
      <section className="card space-y-3">
        <div>
          <h2 className="text-base font-semibold text-dark-100">Club Members ({members.length})</h2>
          <p className="mt-1 text-xs text-surface-muted">
            Promoting a member to admin gives them full admin rights on every group attached to this club
            (derived at read time — no rows are written into group_memberships).
          </p>
        </div>

        {members.length === 0 ? (
          <p className="text-sm text-surface-muted italic">No members yet.</p>
        ) : (
          <ul className="divide-y divide-surface-border rounded-lg ring-1 ring-surface-border bg-surface-raised overflow-hidden">
            {members.map((m) => {
              const isAdmin = m.club_role === "admin";
              const pid = m.profile?.id;
              return (
                <li key={pid ?? Math.random()} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-dark-100 truncate">
                      {m.profile?.display_name ?? "Unknown"}
                      {isAdmin && <span className="ml-1.5 badge-yellow text-[10px]">Admin</span>}
                    </p>
                    <p className="text-xs text-surface-muted truncate">{m.profile?.email}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {pid && (
                      <button
                        onClick={() => setRole(pid, isAdmin ? "member" : "admin")}
                        disabled={memberBusy === pid}
                        className="text-xs text-brand-400 hover:text-brand-300"
                      >
                        {memberBusy === pid ? "…" : isAdmin ? "Demote" : "Promote"}
                      </button>
                    )}
                    {pid && (
                      <button
                        onClick={() => removeMember(pid, m.profile?.display_name ?? "this member")}
                        disabled={memberBusy === pid}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Danger zone (site admins only) ── */}
      {canDeleteClub && (
        <section className="card border border-red-500/30 space-y-3">
          <h2 className="text-base font-semibold text-red-400">Danger zone</h2>
          <p className="text-xs text-surface-muted">
            Deleting a club detaches its groups (which become standalone again) and removes club
            memberships + invite tokens. Group data is untouched. Tournaments currently hosted by
            this club become individual tournaments.
          </p>
          <button onClick={handleDelete} className="btn-secondary !text-red-400 !border-red-500/40 hover:!bg-red-900/20">
            Delete Club
          </button>
        </section>
      )}
    </div>
  );
}
