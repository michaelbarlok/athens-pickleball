import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { TournamentsTable, type TournamentRow } from "./tournaments-table";
import { getAdminScope } from "@/lib/admin-scope";

export default async function AdminTournamentsPage() {
  const supabase = await createClient();

  // Tournaments aren't tied to a group (no tournaments.group_id),
  // so the scoping signal for non-site-admins is whether the caller
  // is the tournament's creator OR listed in tournament_organizers.
  // Site admins fall through to the unscoped query.
  const scope = await getAdminScope(supabase);
  if (!scope) redirect("/dashboard");

  let allowedIds: string[] | null = null;
  if (!scope.siteAdmin) {
    const { data: organizing } = await supabase
      .from("tournament_organizers")
      .select("tournament_id")
      .eq("profile_id", scope.profileId);
    const { data: created } = await supabase
      .from("tournaments")
      .select("id")
      .eq("created_by", scope.profileId);
    allowedIds = Array.from(
      new Set([
        ...(organizing ?? []).map((o) => o.tournament_id),
        ...(created ?? []).map((t) => t.id),
      ])
    );
  }

  let query = supabase
    .from("tournaments")
    .select(
      "*, creator:profiles!created_by(display_name), registrations:tournament_registrations(count)"
    )
    .order("created_at", { ascending: false });
  if (allowedIds !== null) {
    // A group admin who's never organized or created a tournament
    // gets an empty list rather than every tournament on the
    // platform. .in("id", []) returns nothing in PostgREST so we
    // need a sentinel that never matches.
    query = query.in("id", allowedIds.length > 0 ? allowedIds : ["__none__"]);
  }
  const { data } = await query;

  const tournaments: TournamentRow[] = (data ?? []) as unknown as TournamentRow[];

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Admin" }, { label: "Tournaments" }]} />
      <PageHeader
        eyebrow="Admin"
        title="Manage Tournaments"
        subtitle={
          scope.siteAdmin
            ? "View, hide, and delete all tournaments across the platform."
            : "Tournaments you created or organize."
        }
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
