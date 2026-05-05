import { createClient } from "@/lib/supabase/server";
import { Breadcrumb } from "@/components/breadcrumb";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { TournamentsTable, type TournamentRow } from "./tournaments-table";

export default async function AdminTournamentsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("tournaments")
    .select(
      "*, creator:profiles!created_by(display_name), registrations:tournament_registrations(count)"
    )
    .order("created_at", { ascending: false });

  const tournaments: TournamentRow[] = (data ?? []) as unknown as TournamentRow[];

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Admin" }, { label: "Tournaments" }]} />
      <PageHeader
        eyebrow="Admin"
        title="Manage Tournaments"
        subtitle="View, hide, and delete all tournaments across the platform."
        actions={
          <Link href="/tournaments/new" className="btn-primary whitespace-nowrap">
            Create
          </Link>
        }
      />

      <TournamentsTable tournaments={tournaments} />
    </div>
  );
}
