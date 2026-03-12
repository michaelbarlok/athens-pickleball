import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function AdminSessionsPage() {
  const supabase = await createClient();

  const { data: sessions } = await supabase
    .from("shootout_sessions")
    .select(`
      *,
      sheet:signup_sheets(event_date, location),
      group:shootout_groups(name, slug),
      participants:session_participants(count)
    `)
    .order("created_at", { ascending: false });

  const statusColors: Record<string, string> = {
    created: "badge-gray",
    checking_in: "badge-blue",
    seeding: "badge-yellow",
    round_active: "badge-green",
    round_complete: "badge-yellow",
    session_complete: "badge-gray",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Shootout Sessions</h1>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Group</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Courts</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Round</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {sessions?.map((session) => (
              <tr key={session.id}>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                  {session.sheet?.event_date
                    ? new Date(session.sheet.event_date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                  {session.group?.name ?? "—"}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span className={statusColors[session.status] ?? "badge-gray"}>
                    {session.status.replace("_", " ")}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                  {session.num_courts}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                  {session.current_round}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm">
                  <Link
                    href={`/admin/sessions/${session.id}`}
                    className="text-brand-600 hover:text-brand-500"
                  >
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
            {(!sessions || sessions.length === 0) && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No sessions yet. Start a shootout from a sign-up sheet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
