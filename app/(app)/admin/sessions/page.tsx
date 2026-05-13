import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SessionsTable, type SessionRow } from "./sessions-table";
import { PageHeader } from "@/components/page-header";
import { getAdminScope } from "@/lib/admin-scope";

export default async function AdminSessionsPage() {
  const supabase = await createClient();

  // Group admins only see sessions for groups they administer.
  // Site admins see all. Unauthorized callers go back to the
  // dashboard.
  const scope = await getAdminScope(supabase);
  if (!scope) redirect("/dashboard");

  let query = supabase
    .from("shootout_sessions")
    .select(
      `*, sheet:signup_sheets(event_date, location), group:shootout_groups(name, slug), participants:session_participants(count)`
    )
    .order("created_at", { ascending: false });
  if (!scope.siteAdmin) {
    query = query.in("group_id", scope.groupIds);
  }
  const { data } = await query;

  const sessions: SessionRow[] = (data ?? []) as unknown as SessionRow[];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Sessions" />

      <SessionsTable sessions={sessions} />
    </div>
  );
}
