"use client";

import { useState } from "react";
import { TournamentCard } from "@/components/tournament-card";
import { FindNearMeButton } from "@/components/find-near-me-button";
import type { TournamentWithCounts } from "@/lib/queries/tournament";
import { EmptyState } from "@/components/empty-state";

const NEARBY_RADIUS_MI = 30;

interface Props {
  active: TournamentWithCounts[];
  past: TournamentWithCounts[];
  isSiteAdmin: boolean;
  /** Server-rendered weather chip per active tournament. The client
   *  wrapper passes the matching node into each card it renders. */
  weatherByTournamentId?: Record<string, React.ReactNode>;
}

/**
 * Client wrapper around the tournament grid.
 *
 * Default render mirrors the prior server-only layout: an "Upcoming
 * & Active" section followed by a "Past" section. When the user
 * taps "Find tournaments near me" we replace the Active list with
 * a distance-sorted slice from /api/tournaments/nearby and hide the
 * Past section (rare to want past+nearby; we can revisit if asked).
 */
export function TournamentsList({
  active,
  past,
  isSiteAdmin,
  weatherByTournamentId,
}: Props) {
  const [nearbyActive, setNearbyActive] = useState<
    TournamentWithCounts[] | null
  >(null);
  const [distanceById, setDistanceById] = useState<Record<string, number>>({});
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function handleLocation({ lat, lon }: { lat: number; lon: number }) {
    setFetchError(null);
    try {
      const res = await fetch(
        `/api/tournaments/nearby?lat=${lat}&lon=${lon}&radius_miles=${NEARBY_RADIUS_MI}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        setFetchError("Couldn't load nearby tournaments.");
        setNearbyActive([]);
        return;
      }
      const data = await res.json();
      type NearbyRow = { id: string; distance_mi: number };
      const rows: NearbyRow[] = data.tournaments ?? [];
      const distMap: Record<string, number> = {};
      for (const r of rows) distMap[r.id] = r.distance_mi;
      // Re-use the full server-fetched record per id so we keep
      // registration_count, creator, divisions etc. without
      // refetching them through a client-side query.
      const byId = new Map(active.map((t) => [t.id, t]));
      const ordered: TournamentWithCounts[] = rows
        .map((r) => byId.get(r.id))
        .filter((t): t is TournamentWithCounts => Boolean(t));
      setNearbyActive(ordered);
      setDistanceById(distMap);
    } catch (e) {
      setFetchError(
        e instanceof Error
          ? e.message
          : "Couldn't load nearby tournaments."
      );
      setNearbyActive([]);
    }
  }

  function clearNearby() {
    setNearbyActive(null);
    setDistanceById({});
    setFetchError(null);
  }

  const showActive = nearbyActive ?? active;
  const inNearbyMode = nearbyActive !== null;

  return (
    <>
      <FindNearMeButton
        onLocation={handleLocation}
        radiusMi={NEARBY_RADIUS_MI}
        label="tournaments"
        onClear={clearNearby}
        fetchError={fetchError}
      />

      {inNearbyMode && (
        <p className="text-sm text-surface-muted">
          Showing {showActive.length}{" "}
          {showActive.length === 1 ? "tournament" : "tournaments"} within{" "}
          {NEARBY_RADIUS_MI} miles, sorted by distance
        </p>
      )}

      {showActive.length > 0 && (
        <div>
          <h2 className="text-eyebrow mb-3">
            {inNearbyMode ? "Near you" : "Upcoming & Active"}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {showActive.map((t) => (
              <TournamentCard
                key={t.id}
                tournament={t}
                isSiteAdmin={isSiteAdmin}
                distanceMi={
                  inNearbyMode ? distanceById[t.id] : undefined
                }
                weather={weatherByTournamentId?.[t.id]}
              />
            ))}
          </div>
        </div>
      )}

      {/* Past tournaments — only when not narrowing by distance.
          A "past tournament 18 mi away" is rarely interesting; if a
          user asks for it later we can add it back behind a toggle. */}
      {!inNearbyMode && past.length > 0 && (
        <div>
          <h2 className="text-eyebrow mb-3">
            Past
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((t) => (
              <TournamentCard
                key={t.id}
                tournament={t}
                isSiteAdmin={isSiteAdmin}
              />
            ))}
          </div>
        </div>
      )}

      {showActive.length === 0 && (!inNearbyMode || true) && past.length === 0 && (
        <EmptyState
          title={
            inNearbyMode
              ? `No tournaments within ${NEARBY_RADIUS_MI} miles`
              : "No tournaments yet"
          }
          description={
            inNearbyMode
              ? "Try clearing the nearby filter or widening your search."
              : "Be the first to create one!"
          }
        />
      )}
    </>
  );
}
