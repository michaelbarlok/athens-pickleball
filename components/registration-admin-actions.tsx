"use client";

import { useState } from "react";
import { useConfirm } from "@/components/confirm-modal";
import { useRouter } from "next/navigation";
import { useSupabase } from "@/components/providers/supabase-provider";
import { getDivisionLabel } from "@/lib/divisions";

/**
 * Organizer-side row actions on a tournament_registrations row.
 *
 * Renders two buttons:
 *
 *   Edit     — opens an inline form to change division or partner.
 *              Seed already has its own toggle column on the admin
 *              registrants table; we don't duplicate it here.
 *   Withdraw — themed confirm, then POSTs DELETE which the API
 *              translates to status='withdrawn' (audit-preserving).
 *
 * Both routes through /api/tournaments/[id]/registrations/[regId]
 * which authorizes the caller as site admin, tournament creator,
 * or tournament_organizers row owner.
 */

interface Props {
  tournamentId: string;
  registrationId: string;
  playerName: string;
  partnerName: string | null;
  partnerId: string | null;
  currentDivision: string;
  availableDivisions: string[];
  isDoubles: boolean;
}

export function RegistrationAdminActions({
  tournamentId,
  registrationId,
  playerName,
  partnerName,
  partnerId,
  currentDivision,
  availableDivisions,
  isDoubles,
}: Props) {
  const confirm = useConfirm();
  const router = useRouter();
  const { supabase } = useSupabase();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftDivision, setDraftDivision] = useState(currentDivision);
  const [draftPartnerId, setDraftPartnerId] = useState<string | null>(partnerId);
  const [partnerSearch, setPartnerSearch] = useState(partnerName ?? "");
  const [searchResults, setSearchResults] = useState<
    { id: string; display_name: string }[]
  >([]);

  async function searchPartners(q: string) {
    setPartnerSearch(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name")
      .ilike("display_name", `%${q.trim()}%`)
      .eq("is_active", true)
      .limit(8);
    setSearchResults(data ?? []);
  }

  async function withdraw() {
    const ok = await confirm({
      title: "Withdraw this team?",
      description: `${playerName}${partnerName ? ` / ${partnerName}` : ""} will be removed from this division. The history is preserved — you can re-register them later if needed.`,
      confirmLabel: "Withdraw team",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/tournaments/${tournamentId}/registrations/${registrationId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to withdraw.");
      setBusy(false);
      return;
    }
    router.refresh();
  }

  async function saveEdit() {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {};
    if (draftDivision !== currentDivision) body.division = draftDivision;
    if (draftPartnerId !== partnerId) body.partner_id = draftPartnerId;

    if (Object.keys(body).length === 0) {
      setEditing(false);
      setBusy(false);
      return;
    }

    const res = await fetch(
      `/api/tournaments/${tournamentId}/registrations/${registrationId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save.");
      setBusy(false);
      return;
    }
    setEditing(false);
    setBusy(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="space-y-2 text-left text-xs">
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-surface-muted mb-1">
            Division
          </label>
          <select
            value={draftDivision}
            onChange={(e) => setDraftDivision(e.target.value)}
            className="input w-full text-xs py-1"
          >
            {availableDivisions.map((d) => (
              <option key={d} value={d}>
                {getDivisionLabel(d)}
              </option>
            ))}
          </select>
        </div>
        {isDoubles && (
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-surface-muted mb-1">
              Partner
            </label>
            <div className="relative">
              <input
                type="text"
                value={partnerSearch}
                onChange={(e) => searchPartners(e.target.value)}
                placeholder="Search players…"
                className="input w-full text-xs py-1"
              />
              {searchResults.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-surface-border bg-surface-raised shadow-lg">
                  {searchResults.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setDraftPartnerId(r.id);
                        setPartnerSearch(r.display_name);
                        setSearchResults([]);
                      }}
                      className="block w-full px-2 py-1 text-left text-xs hover:bg-surface-overlay text-dark-100"
                    >
                      {r.display_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setDraftPartnerId(null);
                setPartnerSearch("");
                setSearchResults([]);
              }}
              className="mt-1 text-[10px] text-surface-muted hover:text-dark-200 underline"
            >
              Clear partner (mark team as Needs Partner)
            </button>
          </div>
        )}
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={saveEdit}
            disabled={busy}
            className="btn-primary text-xs px-2 py-1"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
              setDraftDivision(currentDivision);
              setDraftPartnerId(partnerId);
              setPartnerSearch(partnerName ?? "");
              setSearchResults([]);
            }}
            className="btn-secondary text-xs px-2 py-1"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs text-brand-vivid hover:opacity-80"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={withdraw}
        disabled={busy}
        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
      >
        {busy ? "…" : "Withdraw"}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
