import { Breadcrumb } from "@/components/breadcrumb";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { SignupSheet } from "@/types/database";
import { SheetsTable, type SheetRow } from "./sheets-table";
import { getAdminScope } from "@/lib/admin-scope";

export default async function AdminSheetsPage() {
  const supabase = await createClient();

  // Group admins see sheets for the groups they admin only. Site
  // admins see everything.
  const scope = await getAdminScope(supabase);
  if (!scope) redirect("/dashboard");

  let sheetsQuery = supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(id, name)")
    .order("event_date", { ascending: false });
  if (!scope.siteAdmin) {
    sheetsQuery = sheetsQuery.in("group_id", scope.groupIds);
  }
  const { data: sheets, error } = await sheetsQuery;

  if (error) {
    return <div className="card text-center text-adaptive-red">Failed to load sheets.</div>;
  }

  // Registration counts per sheet
  const sheetIds = (sheets ?? []).map((s: SignupSheet) => s.id);
  const { data: regRows } = await supabase
    .from("registrations")
    .select("sheet_id, status")
    .in("sheet_id", sheetIds.length > 0 ? sheetIds : ["__none__"])
    .in("status", ["confirmed", "waitlist"]);

  const countMap: Record<string, { confirmed: number; waitlisted: number }> = {};
  (regRows ?? []).forEach((r: { sheet_id: string; status: string }) => {
    if (!countMap[r.sheet_id]) countMap[r.sheet_id] = { confirmed: 0, waitlisted: 0 };
    if (r.status === "confirmed") countMap[r.sheet_id].confirmed++;
    if (r.status === "waitlist") countMap[r.sheet_id].waitlisted++;
  });

  // Shape and partition
  const all: SheetRow[] = (sheets ?? []).map((s: SignupSheet & { group?: { id: string; name: string } }) => ({
    id: s.id,
    event_date: s.event_date,
    event_time: s.event_time ?? null,
    player_limit: s.player_limit,
    status: s.status,
    group: s.group ?? null,
    confirmed: countMap[s.id]?.confirmed ?? 0,
    waitlisted: countMap[s.id]?.waitlisted ?? 0,
  }));

  const active = all.filter((s) => s.status !== "cancelled");
  const cancelled = all.filter((s) => s.status === "cancelled");

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Admin" }, { label: "Sign-Up Sheets" }]} />
      <PageHeader
        eyebrow="Admin"
        title="Manage Sign-Up Sheets"
        subtitle="Create and manage event sign-up sheets for your groups."
        actions={
          <Link href="/admin/sheets/new" className="btn-primary whitespace-nowrap">
            Create Sheet
          </Link>
        }
      />

      <div className="space-y-2">
        <h2 className="text-eyebrow">Active</h2>
        <SheetsTable sheets={active} kind="active" />
      </div>

      {cancelled.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-eyebrow">Cancelled</h2>
          <SheetsTable sheets={cancelled} kind="cancelled" />
        </div>
      )}
    </div>
  );
}
