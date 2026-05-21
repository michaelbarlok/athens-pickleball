import { listTournaments } from "@/lib/queries/tournament";
import { TournamentFilterBar } from "./filter-bar";
import { TournamentsList } from "./tournaments-list";
import { createClient } from "@/lib/supabase/server";
import { WeatherBadge } from "@/components/weather-badge";
import { PageHeader } from "@/components/page-header";
import { wallClockInZoneToIso } from "@/lib/timezone";
import { DEFAULT_TZ } from "@/lib/utils";
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

  // Pre-render weather chips on the server so the client TournamentsList
  // wrapper doesn't have to pull the async weather module into the
  // client bundle. WeatherBadge returns null itself when there's no
  // forecast in the 5-day window, so we can pre-render every active
  // tournament here without conditionally guarding.
  const weatherByTournamentId: Record<string, React.ReactNode> = {};
  for (const t of active) {
    const startTime = (t as { start_time?: string | null }).start_time;
    if (t.start_date && startTime) {
      // Resolve the bare wall-clock (`start_date` + `start_time`) into
      // a UTC instant in the tournament's zone so the weather lookup
      // picks the right NWS hour bucket on a UTC-deployed server.
      const tz = (t as { timezone?: string | null }).timezone ?? DEFAULT_TZ;
      const eventTimeUtc = wallClockInZoneToIso(`${t.start_date}T${startTime}`, tz);
      weatherByTournamentId[t.id] = (
        <WeatherBadge
          location={t.location}
          cityState={[(t as { city?: string | null }).city, (t as { state?: string | null }).state].filter(Boolean).join(", ") || null}
          eventTime={eventTimeUtc ?? `${t.start_date}T${startTime}`}
        />
      );
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tournaments"
        actions={
          // Anonymous visitors can browse tournaments but not create
          // one — the create form is auth-gated. Mirrors the clubs
          // list, which only shows "+ New Club" to signed-in users.
          user ? (
            <Link href="/tournaments/new" className="btn-primary">
              Create Tournament
            </Link>
          ) : null
        }
      />

      <TournamentFilterBar />

      <TournamentsList
        active={active}
        past={past}
        isSiteAdmin={isSiteAdmin}
        weatherByTournamentId={weatherByTournamentId}
      />
    </div>
  );
}

