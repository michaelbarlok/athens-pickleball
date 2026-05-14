"use client";

import { AdminDeleteButton } from "@/components/delete-tournament-button";
import { HideTournamentToggle } from "./hide-toggle";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyIllustrationTrophy } from "@/components/empty-state";
import Link from "next/link";
import { DEFAULT_TZ, formatDateInZone } from "@/lib/utils";
import { TOURNAMENT_STATUS_COLORS, TOURNAMENT_STATUS_LABELS } from "@/lib/status-colors";

export type TournamentRow = {
  id: string;
  title: string;
  type: string;
  start_date: string | null;
  status: string;
  player_cap: number | null;
  is_hidden: boolean | null;
  creator: { display_name: string | null } | null;
  /** Embedded list of registration rows. Player count = sum of player
   *  + partner per active (non-withdrawn) row; a doubles row with no
   *  partner_id contributes 1, with a partner contributes 2, singles
   *  is always 1. PostgREST's embedded `(count)` was including
   *  withdrawals + counting team rows, which over-counted on both
   *  axes. */
  registrations: { status: string; partner_id: string | null }[] | null;
};

function activePlayerCount(t: TournamentRow): number {
  return (t.registrations ?? [])
    .filter((r) => r.status !== "withdrawn")
    .reduce(
      (sum, r) => sum + (t.type === "doubles" && r.partner_id ? 2 : 1),
      0
    );
}

export function TournamentsTable({ tournaments }: { tournaments: TournamentRow[] }) {
  const columns: Column<TournamentRow>[] = [
    {
      key: "title",
      header: "Title",
      cell: (t) => (
        <Link href={`/tournaments/${t.id}`} className="font-medium text-dark-100 hover:text-brand-300">
          {t.title}
        </Link>
      ),
      sortValue: (t) => t.title.toLowerCase(),
      sortable: true,
      priority: "primary",
    },
    {
      key: "date",
      header: "Date",
      cell: (t) =>
        t.start_date
          ? formatDateInZone(t.start_date, (t as { timezone?: string | null }).timezone ?? DEFAULT_TZ)
          : "—",
      sortValue: (t) => t.start_date ?? "",
      sortable: true,
      priority: "primary",
    },
    {
      key: "status",
      header: "Status",
      cell: (t) => (
        <span className={TOURNAMENT_STATUS_COLORS[t.status] ?? "status-closed"}>
          {TOURNAMENT_STATUS_LABELS[t.status] ?? t.status}
        </span>
      ),
      priority: "primary",
    },
    {
      key: "registered",
      header: "Players",
      cell: (t) => {
        const n = activePlayerCount(t);
        return n === 1 ? "1 player" : `${n} players`;
      },
      sortValue: (t) => activePlayerCount(t),
      sortable: true,
      align: "right",
      priority: "secondary",
    },
    {
      key: "creator",
      header: "Creator",
      cell: (t) => t.creator?.display_name ?? "—",
      priority: "tertiary",
    },
    {
      key: "visibility",
      header: "Visibility",
      cell: (t) => <HideTournamentToggle tournamentId={t.id} isHidden={t.is_hidden ?? false} />,
      priority: "secondary",
    },
    {
      key: "actions",
      header: "",
      cell: (t) => (
        <div className="flex items-center justify-end gap-3 text-sm">
          <Link href={`/tournaments/${t.id}`} className="text-brand-400 hover:text-brand-300">
            View
          </Link>
          <AdminDeleteButton tournamentId={t.id} />
        </div>
      ),
      align: "right",
      priority: "primary",
    },
  ];

  return (
    <DataTable
      data={tournaments}
      columns={columns}
      keyFn={(t) => t.id}
      mobileMode="cards"
      caption="All tournaments"
      empty={{
        title: "No tournaments yet",
        description: "Create the first tournament to get things rolling.",
        illustration: <EmptyIllustrationTrophy />,
        actionLabel: "Create tournament",
        actionHref: "/tournaments/new",
      }}
    />
  );
}
