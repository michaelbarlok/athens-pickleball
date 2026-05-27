import Link from "next/link";
import Image from "next/image";
import type { TournamentWithCounts } from "@/lib/queries/tournament";
import { DEFAULT_TZ, formatDateInZone, formatTimeInZone } from "@/lib/utils";
import { TOURNAMENT_STATUS_COLORS, TOURNAMENT_STATUS_LABELS } from "@/lib/status-colors";
import { TournamentNotifyMembersButton } from "@/components/tournament-notify-members-button";
import { formatDistanceMi } from "@/components/find-near-me-button";
import { MapPinIcon } from "@/components/icons";
import { Card, CardBadge, type CardAccent } from "@/components/card-primitives";

const STATUS_ACCENT: Record<string, CardAccent> = {
  draft: "gray",
  registration_open: "open",
  registration_closed: "brand",
  in_progress: "warning",
  completed: "gray",
  cancelled: "cancelled",
};

const FORMAT_LABELS: Record<string, string> = {
  single_elimination: "Single Elim",
  double_elimination: "Double Elim",
  round_robin: "Round Robin",
};

export function TournamentCard({
  tournament,
  isSiteAdmin = false,
  distanceMi,
  weather,
  showCreator = true,
}: {
  tournament: TournamentWithCounts;
  /** Site admins (profile.role === "admin") see a "Notify Members"
   *  CTA on each card so they can email the membership about the
   *  tournament without opening the detail page first. */
  isSiteAdmin?: boolean;
  /** When set (Tournaments listing in nearby mode), surfaces a small
   *  "X mi" pill on the card so players see how far each event is. */
  distanceMi?: number;
  /** Pre-rendered weather chip from the server. Optional — when not
   *  supplied no chip is shown. We render this as a passed ReactNode
   *  rather than calling <WeatherBadge> here so the card can also be
   *  rendered from client components (the new tournaments-list
   *  client wrapper) without dragging the async server-only weather
   *  module into the client bundle. */
  weather?: React.ReactNode;
  /** Hide the "by Creator" attribution line for anonymous visitors —
   *  the public tournament list shouldn't leak member names. */
  showCreator?: boolean;
}) {
  const t = tournament;
  const isOpen = t.status === "registration_open";
  const accent = STATUS_ACCENT[t.status] ?? "gray";
  // `registration_count` is now total players (see lib/queries/tournament.ts
  // for the per-tournament-type math). We deliberately don't render
  // /player_cap on the card because the DB cap enforcement counts
  // team rows, not players — comparing player count to a team cap
  // would surface a misleading "X/Y full" ratio.

  const logoUrl = (t as any).logo_url as string | null | undefined;

  const cityState = [
    (t as { city?: string | null }).city,
    (t as { state?: string | null }).state,
  ]
    .filter(Boolean)
    .join(", ");
  const tz = (t as { timezone?: string | null }).timezone ?? DEFAULT_TZ;
  const hostGroup = (t as { host_group?: { name: string } | null }).host_group;
  const hostClub = (t as { host_club?: { name: string } | null }).host_club;
  const hostedBy = hostClub?.name ?? hostGroup?.name ?? null;

  return (
    <Card accent={accent} className="h-full">
      {/* Header is a navigation Link wrapping title + metadata. The
          register button / notify button live outside the Link so
          they don't trigger card navigation when clicked. */}
      <Link href={`/tournaments/${t.id}`} className="flex flex-col gap-3 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {logoUrl && (
              // 56px standard logo per the card system spec.
              // object-contain + surface-overlay background so wide /
              // tall / transparent org logos render fully without
              // getting cropped.
              <div className="h-14 w-14 shrink-0 rounded-md bg-surface-overlay ring-1 ring-surface-border flex items-center justify-center overflow-hidden">
                <Image
                  src={logoUrl}
                  alt=""
                  width={56}
                  height={56}
                  className="h-full w-full object-contain p-1"
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              {hostedBy && (
                <p className="text-[11px] text-brand-300 leading-tight mb-0.5">
                  Hosted by <span className="font-medium">{hostedBy}</span>
                  {(hostClub || hostGroup) && (
                    <CardBadge variant="info" tone="brand" size="xs" className="ml-1.5">
                      Members only
                    </CardBadge>
                  )}
                </p>
              )}
              <h3 className="text-base font-semibold text-dark-100 line-clamp-2 min-w-0">
                {t.title}
              </h3>
            </div>
          </div>
          {/* Trailing slot: status pill + distance + weather chip,
              stacked vertically. Weather lives here per the unified
              "weather is right-aligned in the header" placement. */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TOURNAMENT_STATUS_COLORS[t.status] ?? ""}`}>
              {TOURNAMENT_STATUS_LABELS[t.status] ?? t.status}
            </span>
            {distanceMi !== undefined && (
              <CardBadge variant="info" tone="brand" size="xs">
                <MapPinIcon className="mr-0.5 h-3 w-3" />
                {formatDistanceMi(distanceMi)}
              </CardBadge>
            )}
            {weather}
          </div>
        </div>

        <div className="space-y-1 text-sm text-surface-muted">
          <p>
            {formatDateInZone(t.start_date, tz)}
            {t.start_time && ` at ${formatTimeInZone(t.start_time, tz)}`}
          </p>
          <p>
            {t.location}
            {cityState && <span> · {cityState}</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CardBadge variant="info" tone="gray" size="xs">
            {FORMAT_LABELS[t.format] ?? t.format}
          </CardBadge>
          <CardBadge variant="identity" tone="blue" size="xs">
            {t.type === "doubles" ? "Doubles" : "Singles"}
          </CardBadge>
          {t.divisions && t.divisions.length > 0 && (
            <CardBadge variant="info" tone="gray" size="xs">
              {t.divisions.length} division{t.divisions.length !== 1 ? "s" : ""}
            </CardBadge>
          )}
        </div>

        <div className="mt-auto pt-3 border-t border-surface-border flex items-center justify-between text-xs text-surface-muted">
          <span>
            {t.registration_count} player{t.registration_count === 1 ? "" : "s"} registered
          </span>
          {showCreator && <span>by {t.creator?.display_name ?? "Unknown"}</span>}
        </div>
      </Link>

      {isOpen && (
        <Link
          href={`/tournaments/${t.id}#register`}
          className="btn-primary w-full text-center mt-3"
        >
          Register
        </Link>
      )}

      {isSiteAdmin && (
        <TournamentNotifyMembersButton
          tournament={{
            id: t.id,
            title: t.title,
            start_date: t.start_date,
            start_time: (t as any).start_time ?? null,
            timezone: (t as { timezone?: string | null }).timezone ?? null,
            location: t.location,
            format: t.format,
            type: (t as any).type ?? "doubles",
            divisions: t.divisions ?? [],
            registration_opens_at: (t as any).registration_opens_at ?? null,
            registration_closes_at: (t as any).registration_closes_at ?? null,
            entry_fee: (t as any).entry_fee ?? null,
            payment_options: (t as any).payment_options ?? [],
            logo_url: (t as any).logo_url ?? null,
          }}
        />
      )}
    </Card>
  );
}
