"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import {
  FindNearMeButton,
  formatDistanceMi,
} from "@/components/find-near-me-button";
import { MapPinIcon } from "@/components/icons";
import { Card, CardHeader, CardBody, CardBadge } from "@/components/card-primitives";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmt12h(time: string) {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${mStr} ${h >= 12 ? "pm" : "am"}`;
}

type PlayTime = {
  day_of_week: number;
  event_time: string;
  timezone: string;
  location: string;
  play_type?: string;
};

function formatPlayTime(pt: PlayTime): string {
  const localTime = fmt12h(pt.event_time.slice(0, 5));
  const tzAbbr =
    new Intl.DateTimeFormat("en-US", { timeZone: pt.timezone, timeZoneName: "short" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  return `${DAY_NAMES[pt.day_of_week]} · ${localTime} ${tzAbbr}`;
}

export interface GroupCardData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  group_type: string;
  visibility: string;
  city: string | null;
  state: string | null;
  /** Parent club summary if this group is part of one. Rendered as
   *  a small "Part of [Club]" link beneath the title — gives players
   *  a one-tap path to the umbrella organization. Null for standalone
   *  groups, which stay first-class. */
  club: { name: string; slug: string } | null;
  memberCount: number;
  isJoined: boolean;
  playTimes: PlayTime[];
}

type Tab = "mine" | "search";

export function GroupList({
  groups,
  playerId,
  joinAction,
  weatherByGroupId,
}: {
  groups: GroupCardData[];
  playerId: string | null;
  joinAction: (groupId: string, groupType: string) => Promise<void>;
  /** Server-rendered weather chip per group (next upcoming sheet
   *  inside the 5-day window). Missing entries → no chip. */
  weatherByGroupId?: Record<string, React.ReactNode>;
}) {
  const [tab, setTab] = useState<Tab>("mine");
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  // Nearby state — populated once the user grants location and the
  // /api/groups/nearby endpoint returns. nearbyGroups === null means
  // "not in nearby mode"; an empty array means "in nearby mode but
  // zero matches within the radius".
  const [nearbyGroups, setNearbyGroups] = useState<GroupCardData[] | null>(null);
  const [nearbyDistanceById, setNearbyDistanceById] = useState<Record<string, number>>({});
  const [fetchError, setFetchError] = useState<string | null>(null);

  const NEARBY_RADIUS_MI = 30;

  async function handleLocation({ lat, lon }: { lat: number; lon: number }) {
    setFetchError(null);
    try {
      const res = await fetch(
        `/api/groups/nearby?lat=${lat}&lon=${lon}&radius_miles=${NEARBY_RADIUS_MI}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        setFetchError("Couldn't load nearby groups.");
        setNearbyGroups([]);
        return;
      }
      const data = await res.json();
      type NearbyRow = {
        id: string;
        name: string;
        slug: string;
        group_type: string;
        city: string | null;
        state: string | null;
        distance_mi: number;
      };
      const rows: NearbyRow[] = data.groups ?? [];
      const distMap: Record<string, number> = {};
      for (const r of rows) distMap[r.id] = r.distance_mi;
      // Pull the matching full GroupCardData out of `discoverable` so
      // we keep memberCount / playTimes / description without re-fetching.
      const byId = new Map(discoverable.map((g) => [g.id, g]));
      const ordered: GroupCardData[] = rows
        .map((r) => byId.get(r.id))
        .filter((g): g is GroupCardData => Boolean(g));
      setNearbyGroups(ordered);
      setNearbyDistanceById(distMap);
    } catch (e) {
      setFetchError(
        e instanceof Error ? e.message : "Couldn't load nearby groups."
      );
      setNearbyGroups([]);
    }
  }

  function clearNearby() {
    setNearbyGroups(null);
    setNearbyDistanceById({});
    setFetchError(null);
  }

  const { mine, discoverable } = useMemo(() => {
    const mine: GroupCardData[] = [];
    const discoverable: GroupCardData[] = [];
    for (const g of groups) {
      if (g.isJoined) mine.push(g);
      else if (g.visibility === "public") discoverable.push(g);
    }
    return { mine, discoverable };
  }, [groups]);

  const filteredSearch = useMemo(() => {
    const s = search.trim().toLowerCase();
    const loc = location.trim().toLowerCase();
    // Source list switches to the nearby-sorted set when the user
    // has shared their location; otherwise full discoverable list.
    const source = nearbyGroups ?? discoverable;
    const filtered = source.filter((g) => {
      const matchesSearch =
        !s ||
        g.name.toLowerCase().includes(s) ||
        g.description?.toLowerCase().includes(s);
      const matchesLocation =
        !loc ||
        g.city?.toLowerCase().includes(loc) ||
        g.state?.toLowerCase().includes(loc) ||
        `${g.city ?? ""}, ${g.state ?? ""}`.toLowerCase().includes(loc);
      const matchesType = typeFilter === "all" || g.group_type === typeFilter;
      return matchesSearch && matchesLocation && matchesType;
    });
    // Preserve the nearby ordering (distance-ascending) when in
    // nearby mode; otherwise the natural fetch order.
    return filtered;
  }, [discoverable, nearbyGroups, search, location, typeFilter]);

  const activeList = tab === "mine" ? mine : filteredSearch;
  const hasFilters = tab === "search" && (search || location || typeFilter !== "all");
  const inNearbyMode = tab === "search" && nearbyGroups !== null;

  return (
    <>
      {/* Tabs */}
      <div className="border-b border-surface-border">
        <nav className="-mb-px flex gap-6">
          <button
            type="button"
            onClick={() => setTab("mine")}
            className={cn(
              "py-2.5 text-sm font-medium transition-colors",
              tab === "mine"
                ? "border-b-2 border-brand-vivid text-brand-vivid"
                : "text-surface-muted hover:text-dark-200"
            )}
          >
            My Groups{mine.length > 0 ? ` (${mine.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setTab("search")}
            className={cn(
              "py-2.5 text-sm font-medium transition-colors",
              tab === "search"
                ? "border-b-2 border-brand-vivid text-brand-vivid"
                : "text-surface-muted hover:text-dark-200"
            )}
          >
            Search for Groups
          </button>
        </nav>
      </div>

      {/* Filters — only on the Search tab */}
      {tab === "search" && (
        <>
          <FindNearMeButton
            onLocation={handleLocation}
            radiusMi={NEARBY_RADIUS_MI}
            label="groups"
            onClear={clearNearby}
            fetchError={fetchError}
          />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search by name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10 w-full"
              />
            </div>
            <input
              type="text"
              placeholder="City or state"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="input w-full"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="input w-full sm:w-auto"
            >
              <option value="all">All Types</option>
              <option value="ladder_league">Ladder</option>
              <option value="free_play">Free Play</option>
            </select>
          </div>

          {inNearbyMode ? (
            <p className="text-sm text-surface-muted">
              Showing {filteredSearch.length}{" "}
              {filteredSearch.length === 1 ? "group" : "groups"} within{" "}
              {NEARBY_RADIUS_MI} miles, sorted by distance
            </p>
          ) : hasFilters ? (
            <p className="text-sm text-surface-muted">
              Showing {filteredSearch.length} of {discoverable.length} groups
            </p>
          ) : null}
        </>
      )}

      {/* Group grid */}
      {activeList.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeList.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              showVisibility={tab === "mine"}
              showJoinButton={tab === "search" && !!playerId}
              onJoin={joinAction}
              weather={weatherByGroupId?.[group.id]}
              distanceMi={
                inNearbyMode ? nearbyDistanceById[group.id] : undefined
              }
            />
          ))}
        </div>
      ) : tab === "mine" ? (
        // Special-cased empty state: the action is a tab switch (in-page
        // state) rather than a route, so we render the EmptyState shell
        // ourselves with a button instead of a Link. Visual rhythm
        // matches the regular EmptyState component.
        <div className="card text-center py-12 space-y-4">
          <div className="space-y-1.5">
            <p className="font-semibold text-dark-100">You haven&apos;t joined any groups yet</p>
            <p className="text-sm text-surface-muted max-w-sm mx-auto">
              Switch to the Search tab to find one.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTab("search")}
            className="text-sm font-medium text-brand-400 hover:text-brand-300"
          >
            Search for Groups →
          </button>
        </div>
      ) : (
        <EmptyState
          title={hasFilters ? "No groups match your filters" : "No public groups available"}
          description={hasFilters ? "Try adjusting your search or filters." : "Check back later, or create one."}
        />
      )}
    </>
  );
}

function GroupCard({
  group,
  showVisibility,
  showJoinButton,
  onJoin,
  weather,
  distanceMi,
}: {
  group: GroupCardData;
  showVisibility: boolean;
  showJoinButton: boolean;
  onJoin: (groupId: string, groupType: string) => Promise<void>;
  weather?: React.ReactNode;
  /** When set (Search tab + nearby mode), surfaces a small "X mi"
   *  chip on the card so players can see how far each option is. */
  distanceMi?: number;
}) {
  const cityState = [group.city, group.state].filter(Boolean).join(", ");
  const firstPlayTime = group.playTimes[0] ?? null;
  const playTimeStr = firstPlayTime ? formatPlayTime(firstPlayTime) : null;
  const extraPlayTimes = group.playTimes.length > 1 ? group.playTimes.length - 1 : 0;

  // Pills reflect what this group actually offers. A ladder_league with
  // both ladder and skills play times gets both pills; a group with no
  // play times yet defaults to its group_type for display so a brand-new
  // group still shows something useful.
  const hasLadderPlay = group.playTimes.some((p) => p.play_type !== "skills");
  const hasSkillsPlay = group.playTimes.some((p) => p.play_type === "skills");
  const showLadderPill =
    group.group_type !== "free_play" && (group.playTimes.length === 0 || hasLadderPlay);
  const showSkillsPill = hasSkillsPlay;
  const showFreePlayPill = group.group_type === "free_play";
  const showJoinForm =
    showJoinButton && !group.isJoined && group.visibility === "public";

  // Card chrome via primitives. The whole header+body block is one
  // navigation Link (matches the existing pattern); the optional Join
  // form lives below the Link as a separate sibling so we don't nest
  // a form inside an anchor.
  return (
    <Card
      accent={group.isJoined ? "brand" : "gray"}
      className={cn("h-full", group.isJoined && "ring-brand-500/30")}
    >
      <Link
        href={`/groups/${group.slug}`}
        className="flex flex-col gap-3 flex-1 min-w-0"
      >
        <CardHeader
          // Groups don't currently have a logo column — the slot stays
          // empty so cards stay aligned with future logo support.
          title={<span className="leading-tight break-words">{group.name}</span>}
          contextLine={
            group.club ? (
              <>
                Part of{" "}
                {/* Inner anchor: stopPropagation keeps a tap on the
                    club name from also triggering the outer group
                    Link navigation. Same pattern the previous card
                    used; nesting is technically not strict HTML but
                    browsers handle it consistently. */}
                <Link
                  href={`/clubs/${group.club.slug}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {group.club.name}
                </Link>
              </>
            ) : null
          }
          badges={
            <>
              {distanceMi !== undefined && (
                <CardBadge variant="info" tone="brand" size="xs">
                  <MapPinIcon className="mr-0.5 h-3 w-3" />
                  {formatDistanceMi(distanceMi)}
                </CardBadge>
              )}
              {showFreePlayPill && (
                <CardBadge variant="identity" tone="yellow" size="xs">
                  Free Play
                </CardBadge>
              )}
              {showLadderPill && (
                <CardBadge variant="identity" tone="blue" size="xs">
                  Ladder
                </CardBadge>
              )}
              {showSkillsPill && (
                <CardBadge variant="identity" tone="blue" size="xs">
                  Skills
                </CardBadge>
              )}
              {showVisibility && group.visibility === "private" && (
                <CardBadge variant="info" tone="gray" size="xs">
                  Private
                </CardBadge>
              )}
            </>
          }
          trailing={weather}
        />

        <CardBody>
          {cityState && (
            <p className="text-xs">
              {cityState}
              {" · "}
              {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
            </p>
          )}
          {!cityState && (
            <p className="text-xs">
              {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
            </p>
          )}

          {playTimeStr && firstPlayTime && (
            <p className="text-xs text-brand-vivid font-medium flex items-center gap-1 min-w-0">
              <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
              </svg>
              <span className="truncate">
                {playTimeStr}
                {firstPlayTime.location ? ` · ${firstPlayTime.location}` : ""}
                {extraPlayTimes > 0 && (
                  <span className="text-surface-muted"> · +{extraPlayTimes} more</span>
                )}
              </span>
            </p>
          )}

          {group.description && (
            <p className="text-xs line-clamp-1 sm:line-clamp-2">{group.description}</p>
          )}
        </CardBody>
      </Link>

      {showJoinForm && (
        <form
          action={async () => {
            await onJoin(group.id, group.group_type);
          }}
          className="mt-auto pt-3 border-t border-surface-border"
        >
          <button type="submit" className="btn-primary w-full text-xs py-1.5">
            Join Group
          </button>
        </form>
      )}
    </Card>
  );
}
