import { EmptyState } from "@/components/empty-state";
import { listTournaments } from "@/lib/queries/tournament";
import { TournamentCard } from "@/components/tournament-card";
import { TournamentFilterBar } from "./filter-bar";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    format?: string;
    type?: string;
    gender?: string;
    location?: string;
  }>;
}) {
  const params = await searchParams;
  const tournaments = await listTournaments({
    status: params.status,
    format: params.format,
    type: params.type,
    gender: params.gender,
    location: params.location,
  });

  // Site admins see a "Notify Members" CTA on each card. Read once
  // here so we don't fan out a profile lookup per card.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let isSiteAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    isSiteAdmin = profile?.role === "admin";
  }

  // Separate active from past
  const active = tournaments.filter(
    (t) => !["completed", "cancelled"].includes(t.status)
  );
  const past = tournaments.filter((t) =>
    ["completed", "cancelled"].includes(t.status)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark-100">Tournaments</h1>
        <Link href="/tournaments/new" className="btn-primary">
          Create Tournament
        </Link>
      </div>

      <TournamentFilterBar />

      {/* Active Tournaments */}
      {active.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-dark-200 mb-3 uppercase tracking-wider">Upcoming & Active</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((t) => (
              <TournamentCard key={t.id} tournament={t} isSiteAdmin={isSiteAdmin} />
            ))}
          </div>
        </div>
      )}

      {/* Past Tournaments */}
      {past.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-dark-200 mb-3 uppercase tracking-wider">Past</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((t) => (
              <TournamentCard key={t.id} tournament={t} isSiteAdmin={isSiteAdmin} />
            ))}
          </div>
        </div>
      )}

      {tournaments.length === 0 && (
        <EmptyState
          title="No tournaments yet"
          description="Be the first to create one!"
          actionLabel="Create Tournament"
          actionHref="/tournaments/new"
        />
      )}
    </div>
  );
}

