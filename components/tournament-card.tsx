import Link from "next/link";
import type { TournamentWithCounts } from "@/lib/queries/tournament";
import { formatDate, formatTime } from "@/lib/utils";
import { TOURNAMENT_STATUS_COLORS, TOURNAMENT_STATUS_LABELS } from "@/lib/status-colors";
import { TournamentNotifyMembersButton } from "@/components/tournament-notify-members-button";
import { formatDistanceMi } from "@/components/find-near-me-button";

const STATUS_ACCENT: Record<string, string> = {
  draft: "card-accent-gray",
  registration_open: "card-accent-green",
  registration_closed: "card-accent-brand",
  in_progress: "card-accent-yellow",
  completed: "card-accent-gray",
  cancelled: "card-accent-red",
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
}) {
  const t = tournament;
  const isOpen = t.status === "registration_open";
  const accent = STATUS_ACCENT[t.status] ?? "card-accent-gray";
  const fillPct = t.player_cap && t.registration_count != null
    ? Math.min((t.registration_count / t.player_cap) * 100, 100)
    : null;

  const logoUrl = (t as any).logo_url as string | null | undefined;

  return (
    <div className={`card hover:ring-1 hover:ring-brand-500/30 transition-all flex flex-col ${accent}`}>
      <Link href={`/tournaments/${t.id}`} className="flex-1">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {logoUrl && (
              // object-contain + surface-overlay background so wide /
              // tall / transparent org logos render fully without
              // getting cropped. p-1 keeps them off the frame edge.
              <div className="h-12 w-12 shrink-0 rounded-md bg-surface-overlay ring-1 ring-surface-border flex items-center justify-center overflow-hidden">
                <img
                  src={logoUrl}
                  alt=""
                  className="h-full w-full object-contain p-1"
                  loading="lazy"
                />
              </div>
            )}
            <h3 className="text-base font-semibold text-dark-100 line-clamp-2 min-w-0">
              {t.title}
            </h3>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TOURNAMENT_STATUS_COLORS[t.status] ?? ""}`}>
              {TOURNAMENT_STATUS_LABELS[t.status] ?? t.status}
            </span>
            {distanceMi !== undefined && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
                📍 {formatDistanceMi(distanceMi)}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-1 text-sm text-surface-muted">
          <p>
            {formatDate(t.start_date + "T00:00:00")}
            {t.start_time && ` at ${formatTime(t.start_time)}`}
          </p>
          <p>{t.location}</p>
          {weather && <div>{weather}</div>}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="inline-flex rounded-full bg-surface-overlay px-2 py-0.5 text-xs font-medium text-dark-200">
            {FORMAT_LABELS[t.format] ?? t.format}
          </span>
          <span className="inline-flex rounded-full bg-surface-overlay px-2 py-0.5 text-xs font-medium text-dark-200 capitalize">
            {t.type}
          </span>
          {t.divisions && t.divisions.length > 0 && (
            <span className="inline-flex rounded-full bg-surface-overlay px-2 py-0.5 text-xs font-medium text-dark-200">
              {t.divisions.length} division{t.divisions.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-surface-border space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-surface-muted">
              {t.registration_count} registered{t.player_cap ? ` / ${t.player_cap}` : ""}
            </span>
            <span className="text-xs text-surface-muted">
              by {t.creator?.display_name ?? "Unknown"}
            </span>
          </div>
          {fillPct !== null && (
            <div className="h-1.5 w-full rounded-full bg-surface-overlay overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${fillPct >= 100 ? "bg-accent-400" : "bg-teal-400"}`}
                style={{ width: `${fillPct}%` }}
              />
            </div>
          )}
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
    </div>
  );
}
