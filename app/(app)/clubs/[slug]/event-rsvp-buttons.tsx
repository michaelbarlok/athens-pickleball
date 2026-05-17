"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ClubEventRsvpStatus } from "@/types/database";

interface Props {
  clubId: string;
  eventId: string;
  allowGuests: boolean;
  isCancelled: boolean;
  /** Null when the viewer has no RSVP yet. */
  myRsvp: { status: ClubEventRsvpStatus; guest_count: number } | null;
  /** Signed-out viewers see disabled buttons that prompt sign-in. */
  loginHref: string | null;
}

const LABELS: Record<ClubEventRsvpStatus, string> = {
  yes: "Going",
  maybe: "Maybe",
  no: "Can't go",
};

const ACTIVE_CLASS: Record<ClubEventRsvpStatus, string> = {
  yes: "bg-teal-600 text-white",
  maybe: "bg-yellow-600 text-white",
  no: "bg-red-600 text-white",
};

/**
 * Three-button RSVP control + optional guest-count stepper for "yes"
 * RSVPs when the event allows guests.
 */
export function EventRsvpButtons({
  clubId,
  eventId,
  allowGuests,
  isCancelled,
  myRsvp,
  loginHref,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [guestCount, setGuestCount] = useState(myRsvp?.guest_count ?? 0);

  async function setStatus(status: ClubEventRsvpStatus) {
    if (loginHref) {
      window.location.href = loginHref;
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/clubs/${clubId}/events/${eventId}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          guest_count: status === "yes" ? guestCount : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't save RSVP");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (isCancelled) {
    return <p className="text-xs text-red-400">Event cancelled.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(LABELS) as ClubEventRsvpStatus[]).map((s) => {
          const isActive = myRsvp?.status === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              disabled={busy}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ring-1 ring-surface-border ${
                isActive ? ACTIVE_CLASS[s] : "bg-surface-overlay text-dark-200 hover:text-dark-100"
              }`}
            >
              {LABELS[s]}
            </button>
          );
        })}
      </div>
      {allowGuests && myRsvp?.status === "yes" && (
        <div className="flex items-center gap-2 text-xs text-surface-muted">
          <span>Guests:</span>
          <input
            type="number"
            min={0}
            max={10}
            value={guestCount}
            onChange={(e) => setGuestCount(Math.max(0, parseInt(e.target.value || "0", 10)))}
            className="input w-16 py-0.5 text-xs"
          />
          <button
            type="button"
            onClick={() => setStatus("yes")}
            disabled={busy || guestCount === (myRsvp?.guest_count ?? 0)}
            className="text-xs text-brand-400 hover:text-brand-300 disabled:opacity-40"
          >
            Update
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
