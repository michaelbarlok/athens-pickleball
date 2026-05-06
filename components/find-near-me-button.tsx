"use client";

import { useState } from "react";
import { MapPinIcon } from "@/components/icons";

type InternalState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; lat: number; lon: number }
  | { kind: "denied" }
  | { kind: "error"; message: string };

interface Props {
  /** Called once the browser hands us coordinates. */
  onLocation: (coords: { lat: number; lon: number }) => void;
  /** Active radius (e.g. 30) — surfaced as label text. */
  radiusMi: number;
  /** What kind of thing we're searching, for the button label. */
  label: string;
  /** Lets the parent reset the chip back to idle when the user
   *  clears the nearby filter. */
  onClear?: () => void;
  /** When set, displayed under the chip in the "ready" state — used
   *  by the parent to surface API failures (e.g. "couldn't load
   *  nearby groups") without taking the button out of ready mode. */
  fetchError?: string | null;
}

/**
 * Single-purpose button that asks the browser for geolocation and
 * forwards coordinates to the parent. Designed to live above a
 * search list — works for groups and tournaments alike.
 *
 * UX notes:
 *   - Never auto-fires the permission prompt. A user gesture
 *     (button click) is required, which keeps Chrome/Safari from
 *     deprioritising future prompts.
 *   - `enableHighAccuracy: false` because we only care about
 *     city-level resolution. Saves battery and returns faster
 *     than a GPS lock.
 *   - Falls back gracefully to a "Search by city instead" prompt
 *     if the user denies permission.
 *   - Production note: the site's Permissions-Policy header must
 *     allow `geolocation=(self)` (see next.config.js). Without it
 *     getCurrentPosition() is silently blocked by the policy and
 *     no permission prompt ever appears.
 */
export function FindNearMeButton({
  onLocation,
  radiusMi,
  label,
  onClear,
  fetchError,
}: Props) {
  const [state, setState] = useState<InternalState>({ kind: "idle" });

  function requestLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({
        kind: "error",
        message: "Your browser doesn't support location.",
      });
      return;
    }
    setState({ kind: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setState({ kind: "ready", lat, lon });
        onLocation({ lat, lon });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setState({ kind: "denied" });
        } else {
          setState({ kind: "error", message: err.message });
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  }

  if (state.kind === "ready") {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-500/40 bg-brand-500/5 px-3 py-2 text-sm">
          <span className="text-dark-200 inline-flex items-center gap-1.5">
            <MapPinIcon className="h-4 w-4 text-brand-300" />
            Showing {label} within {radiusMi} miles of you
          </span>
          <button
            type="button"
            onClick={() => {
              setState({ kind: "idle" });
              onClear?.();
            }}
            className="text-xs text-surface-muted hover:text-dark-200 underline"
          >
            Clear
          </button>
        </div>
        {fetchError && (
          <p className="text-xs text-red-300">{fetchError}</p>
        )}
      </div>
    );
  }

  if (state.kind === "denied") {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-300 space-y-1">
        <p>
          Location permission is off. Search by city instead, or enable
          location for tristarpickleball.com in your browser&apos;s site
          settings to find {label} near you.
        </p>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="text-xs underline opacity-80 hover:opacity-100"
        >
          Try again
        </button>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-300 space-y-1">
        <p>Couldn&apos;t get your location ({state.message}). Search by city instead.</p>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="text-xs underline opacity-80 hover:opacity-100"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={requestLocation}
      disabled={state.kind === "loading"}
      className="flex items-center justify-center gap-2 w-full rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-2.5 text-sm font-medium text-brand-300 hover:bg-brand-500/20 transition-colors disabled:opacity-60"
    >
      <MapPinIcon className="h-4 w-4" />
      {state.kind === "loading"
        ? "Getting your location…"
        : `Find ${label} near me (within ${radiusMi} miles)`}
    </button>
  );
}

export function formatDistanceMi(d: number): string {
  if (d < 0.1) return "Right here";
  if (d < 1) return `${(d * 10 | 0) / 10} mi`;
  if (d < 10) return `${d.toFixed(1)} mi`;
  return `${Math.round(d)} mi`;
}
