import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatDate, formatShortDate } from "@/lib/utils";
import type { SignupSheet } from "@/types/database";

const statusBadge: Record<string, { className: string; label: string }> = {
  open: { className: "badge-green", label: "Open" },
  closed: { className: "badge-yellow", label: "Closed" },
  cancelled: { className: "badge-red", label: "Cancelled" },
};

export default async function SheetsPage() {
  const supabase = await createClient();

  const { data: sheets, error } = await supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(id, name, slug)")
    .order("event_date", { ascending: false });

  if (error) {
    return (
      <div className="card text-center text-red-600">
        Failed to load sign-up sheets. Please try again later.
      </div>
    );
  }

  // Fetch registration counts per sheet
  const sheetIds = (sheets ?? []).map((s: SignupSheet) => s.id);
  const { data: regCounts } = await supabase
    .from("registrations")
    .select("sheet_id, status")
    .in("sheet_id", sheetIds.length > 0 ? sheetIds : ["__none__"])
    .in("status", ["confirmed", "waitlist"]);

  const countMap: Record<string, number> = {};
  (regCounts ?? []).forEach((r: { sheet_id: string; status: string }) => {
    if (r.status === "confirmed") {
      countMap[r.sheet_id] = (countMap[r.sheet_id] ?? 0) + 1;
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Sign-Up Sheets</h1>
      </div>

      {!sheets || sheets.length === 0 ? (
        <div className="card text-center text-gray-500">
          No sign-up sheets available yet.
        </div>
      ) : (
        <div className="space-y-3">
          {sheets.map((sheet: SignupSheet & { group?: { id: string; name: string; slug: string } }) => {
            const badge = statusBadge[sheet.status] ?? statusBadge.closed;
            const registered = countMap[sheet.id] ?? 0;

            return (
              <Link
                key={sheet.id}
                href={`/sheets/${sheet.id}`}
                className="card flex items-center justify-between hover:ring-brand-300 transition-shadow"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-gray-900">
                      {sheet.group?.name ?? "Event"}
                    </p>
                    <span className={badge.className}>{badge.label}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                    <span>{formatDate(sheet.event_date)}</span>
                    <span>{sheet.location}</span>
                  </div>
                </div>
                <div className="ml-4 text-right text-sm text-gray-600 shrink-0">
                  <span className="font-medium text-gray-900">
                    {registered}
                  </span>
                  /{sheet.player_limit} players
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
