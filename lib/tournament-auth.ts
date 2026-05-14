import { getAuthUser } from "@/lib/auth";

/**
 * Check if the current user can manage a tournament.
 * Returns the profile and supabase client if authorized, null otherwise.
 *
 * A user can manage a tournament if they are:
 * - a global site admin
 * - the tournament creator
 * - a co-organizer (in tournament_organizers)
 * - an active admin (`group_role='admin'`) of the tournament's host
 *   group, if one is set
 *
 * The host-group admin path is intentionally derived (not synced into
 * tournament_organizers): admin promotions/demotions in the group take
 * effect on the tournament immediately, with no extra bookkeeping.
 */
export async function getTournamentManager(tournamentId: string) {
  const auth = await getAuthUser();
  if (!auth) return null;

  const { profile, supabase } = auth;

  // Global admin — always allowed
  if (profile.role === "admin") {
    return { profile, supabase };
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("created_by, host_group_id")
    .eq("id", tournamentId)
    .single();
  if (!tournament) return null;

  // Creator
  if (tournament.created_by === profile.id) {
    return { profile, supabase };
  }

  // Co-organizer
  const { data: organizer } = await supabase
    .from("tournament_organizers")
    .select("profile_id")
    .eq("tournament_id", tournamentId)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (organizer) {
    return { profile, supabase };
  }

  // Host-group admin — inherits organizer rights for the lifetime of
  // their group_role='admin' membership. Skipped when host_group_id
  // is null (individual-hosted tournament).
  if (tournament.host_group_id) {
    const { data: hostAdmin } = await supabase
      .from("group_memberships")
      .select("group_role")
      .eq("group_id", tournament.host_group_id)
      .eq("player_id", profile.id)
      .eq("group_role", "admin")
      .maybeSingle();
    if (hostAdmin) {
      return { profile, supabase };
    }
  }

  return null;
}
