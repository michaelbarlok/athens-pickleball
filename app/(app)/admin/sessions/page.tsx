import { createClient } from "@/lib/supabase/server";
import { SessionsTable, type SessionRow } from "./sessions-table";
import { PageHeader } from "@/components/page-header";

export default async function AdminSessionsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("shootout_sessions")
    .select(
      `*, sheet:signup_sheets(event_date, location), group:shootout_groups(name, slug), participants:session_participants(count)`
    )
    .order("created_at", { ascending: false });

  const sessions: SessionRow[] = (data ?? []) as unknown as SessionRow[];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Sessions" />

      <SessionsTable sessions={sessions} />
    </div>
  );
}
