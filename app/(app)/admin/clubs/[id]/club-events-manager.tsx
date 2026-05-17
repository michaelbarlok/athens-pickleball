"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/confirm-modal";
import { FormError } from "@/components/form-error";
import { DEFAULT_TZ, formatDateInZone, formatTimeInZone } from "@/lib/utils";
import { wallClockInZoneToIso, isoToWallClockInZone } from "@/lib/timezone";
import type { ClubEvent } from "@/types/database";

interface Props {
  clubId: string;
  events: ClubEvent[];
}

interface DraftEvent {
  title: string;
  description: string;
  /** datetime-local string for the form (wall-clock in `timezone`). */
  eventAtLocal: string;
  timezone: string;
  location: string;
  capacity: string;
  allowGuests: boolean;
}

const EMPTY_DRAFT: DraftEvent = {
  title: "",
  description: "",
  eventAtLocal: "",
  timezone: DEFAULT_TZ,
  location: "",
  capacity: "",
  allowGuests: false,
};

/**
 * Site/club admin UI for creating, editing, and cancelling club
 * events. Lists existing events (upcoming first, then past), and
 * exposes an inline form for create + per-row edit.
 */
export function ClubEventsManager({ clubId, events }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<DraftEvent>(EMPTY_DRAFT);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftEvent>(EMPTY_DRAFT);

  async function createEvent() {
    setError("");
    if (!draft.title.trim()) {
      setError("Title is required");
      return;
    }
    if (!draft.eventAtLocal) {
      setError("Date & time required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/clubs/${clubId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim(),
          description: draft.description.trim() || null,
          event_at: wallClockInZoneToIso(draft.eventAtLocal, draft.timezone),
          timezone: draft.timezone,
          location: draft.location.trim() || null,
          capacity: draft.capacity ? Number(draft.capacity) : null,
          allow_guests: draft.allowGuests,
          notify,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create event");
        return;
      }
      setDraft(EMPTY_DRAFT);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function startEdit(e: ClubEvent) {
    setEditingId(e.id);
    setEditDraft({
      title: e.title,
      description: e.description ?? "",
      eventAtLocal: isoToWallClockInZone(e.event_at, e.timezone),
      timezone: e.timezone,
      location: e.location ?? "",
      capacity: e.capacity != null ? String(e.capacity) : "",
      allowGuests: e.allow_guests,
    });
  }

  async function saveEdit(eventId: string) {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/clubs/${clubId}/events/${eventId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editDraft.title.trim(),
          description: editDraft.description.trim() || null,
          event_at: wallClockInZoneToIso(editDraft.eventAtLocal, editDraft.timezone),
          timezone: editDraft.timezone,
          location: editDraft.location.trim() || null,
          capacity: editDraft.capacity ? Number(editDraft.capacity) : null,
          allow_guests: editDraft.allowGuests,
          notify,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save event");
        return;
      }
      setEditingId(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function cancelEvent(e: ClubEvent) {
    const ok = await confirm({
      title: `Cancel "${e.title}"?`,
      description:
        "Members will see a Cancelled badge on the event card. If you check 'Notify' below, they'll also get a push + email.",
      confirmLabel: "Cancel event",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/clubs/${clubId}/events/${e.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to cancel event");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const now = Date.now();
  const upcoming = events.filter((e) => Date.parse(e.event_at) >= now);
  const past = events.filter((e) => Date.parse(e.event_at) < now);

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-base font-semibold text-dark-100">Club Events</h2>
        <p className="mt-1 text-xs text-surface-muted">
          One-off socials, cookouts, opening day, clinic, annual meeting. Members RSVP from
          the public club page. Not a sign-up sheet (no ladder / session) and not a tournament
          (no bracket).
        </p>
      </div>

      {/* ── Create form ── */}
      <div className="rounded-lg ring-1 ring-surface-border bg-surface-raised p-3 space-y-3">
        <p className="text-sm font-medium text-dark-100">New event</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-dark-200 mb-1">Title</label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="input"
              maxLength={200}
              placeholder="Summer cookout"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-200 mb-1">Date & time</label>
            <input
              type="datetime-local"
              value={draft.eventAtLocal}
              onChange={(e) => setDraft({ ...draft, eventAtLocal: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-200 mb-1">Timezone</label>
            <input
              type="text"
              value={draft.timezone}
              onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
              className="input"
              placeholder={DEFAULT_TZ}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-dark-200 mb-1">Location</label>
            <input
              type="text"
              value={draft.location}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              className="input"
              placeholder="Court 3, Main Park"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-dark-200 mb-1">Description</label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className="input min-h-[70px]"
              maxLength={4000}
              placeholder="What to bring, what to expect…"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-200 mb-1">
              Capacity (optional)
            </label>
            <input
              type="number"
              min={1}
              value={draft.capacity}
              onChange={(e) => setDraft({ ...draft, capacity: e.target.value })}
              className="input"
              placeholder="Unlimited"
            />
          </div>
          <label className="flex items-center gap-2 mt-5">
            <input
              type="checkbox"
              checked={draft.allowGuests}
              onChange={(e) => setDraft({ ...draft, allowGuests: e.target.checked })}
            />
            <span className="text-sm text-dark-200">Allow members to bring guests</span>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <label className="flex items-center gap-2 text-xs text-dark-200">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Notify all club members (push + email)
          </label>
          <button onClick={createEvent} disabled={busy} className="btn-primary">
            {busy ? "…" : "Create event"}
          </button>
        </div>
      </div>

      <FormError message={error} />

      {/* ── List ── */}
      {upcoming.length === 0 && past.length === 0 ? (
        <p className="text-sm text-surface-muted italic">No events yet.</p>
      ) : (
        <div className="space-y-4">
          {upcoming.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-surface-muted">Upcoming</p>
              <ul className="space-y-2">
                {upcoming.map((e) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    editingId={editingId}
                    editDraft={editDraft}
                    setEditDraft={setEditDraft}
                    onStartEdit={() => startEdit(e)}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={() => saveEdit(e.id)}
                    onCancelEvent={() => cancelEvent(e)}
                    busy={busy}
                  />
                ))}
              </ul>
            </div>
          )}
          {past.length > 0 && (
            <details className="space-y-2">
              <summary className="text-xs uppercase tracking-wide text-surface-muted cursor-pointer">
                Past ({past.length})
              </summary>
              <ul className="space-y-2 pt-2">
                {past.map((e) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    editingId={editingId}
                    editDraft={editDraft}
                    setEditDraft={setEditDraft}
                    onStartEdit={() => startEdit(e)}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={() => saveEdit(e.id)}
                    onCancelEvent={() => cancelEvent(e)}
                    busy={busy}
                  />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function EventRow({
  event,
  editingId,
  editDraft,
  setEditDraft,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onCancelEvent,
  busy,
}: {
  event: ClubEvent;
  editingId: string | null;
  editDraft: DraftEvent;
  setEditDraft: (d: DraftEvent) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onCancelEvent: () => void;
  busy: boolean;
}) {
  const isEditing = editingId === event.id;
  if (isEditing) {
    return (
      <li className="rounded-lg ring-1 ring-brand-500/30 bg-surface-raised p-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={editDraft.title}
            onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
            className="input sm:col-span-2"
            placeholder="Title"
          />
          <input
            type="datetime-local"
            value={editDraft.eventAtLocal}
            onChange={(e) => setEditDraft({ ...editDraft, eventAtLocal: e.target.value })}
            className="input"
          />
          <input
            type="text"
            value={editDraft.timezone}
            onChange={(e) => setEditDraft({ ...editDraft, timezone: e.target.value })}
            className="input"
            placeholder={DEFAULT_TZ}
          />
          <input
            type="text"
            value={editDraft.location}
            onChange={(e) => setEditDraft({ ...editDraft, location: e.target.value })}
            className="input sm:col-span-2"
            placeholder="Location"
          />
          <textarea
            value={editDraft.description}
            onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
            className="input sm:col-span-2 min-h-[60px]"
            placeholder="Description"
          />
          <input
            type="number"
            min={1}
            value={editDraft.capacity}
            onChange={(e) => setEditDraft({ ...editDraft, capacity: e.target.value })}
            className="input"
            placeholder="Capacity"
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={editDraft.allowGuests}
              onChange={(e) => setEditDraft({ ...editDraft, allowGuests: e.target.checked })}
            />
            <span className="text-sm text-dark-200">Allow guests</span>
          </label>
        </div>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancelEdit} disabled={busy} className="text-xs text-surface-muted hover:text-dark-200">
            Cancel
          </button>
          <button onClick={onSaveEdit} disabled={busy} className="btn-primary">
            {busy ? "…" : "Save"}
          </button>
        </div>
      </li>
    );
  }
  return (
    <li className="rounded-lg ring-1 ring-surface-border bg-surface-raised p-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-dark-100 truncate">
          {event.title}
          {event.is_cancelled && <span className="ml-1.5 badge-red text-[10px]">Cancelled</span>}
        </p>
        <p className="text-xs text-surface-muted mt-0.5">
          {formatDateInZone(event.event_at, event.timezone)} at{" "}
          {formatTimeInZone(event.event_at, event.timezone)}
          {event.location ? ` · ${event.location}` : ""}
          {event.capacity ? ` · cap ${event.capacity}` : ""}
          {event.allow_guests ? " · guests OK" : ""}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <button onClick={onStartEdit} disabled={busy} className="text-xs text-brand-400 hover:text-brand-300">
          Edit
        </button>
        {!event.is_cancelled && (
          <button
            onClick={onCancelEvent}
            disabled={busy}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Cancel
          </button>
        )}
      </div>
    </li>
  );
}
